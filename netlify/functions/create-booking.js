import {
  getServiceClient, getClientIp, checkRateLimit,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';
import { evaluateZip, loadServiceAreaConfig } from './_shared/serviceArea.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const body = await req.json();
    const ip = getClientIp(req);
    const supabase = getServiceClient();

    // Rate limit: 20 bookings per IP per hour
    const allowed = await checkRateLimit(supabase, ip, 'create-booking', 3600, 20);
    if (!allowed) {
      return errorResponse('Too many submissions. Please wait.', 429);
    }

    // Validate required fields
    const { sessionId, idempotencyKey, customerName, customerPhone, address, city, zip, fullAddress } = body;
    if (!sessionId || !idempotencyKey || !customerName || !customerPhone || !address || !city || !zip || !fullAddress) {
      return errorResponse('Missing required fields');
    }
    // Optional test-run tag — stored alongside booking for scoped cleanup in test environments
    const testRunId = body.testRunId || null;

    // Server-side service-area enforcement (cannot be bypassed by the client).
    // Fail-closed: infrastructure errors block the booking rather than allowing unknown ZIPs.
    // The 'unconfigured' reason (intentionally empty lists) is the only permitted pass-through.
    try {
      const saConfig = await loadServiceAreaConfig();
      const serviceAreaResult = evaluateZip(zip, saConfig);
      if (!serviceAreaResult.serviceable) {
        return errorResponse('Address is outside the service area', 422);
      }
    } catch {
      return errorResponse('Service area check unavailable. Please try again shortly.', 503);
    }

    // Idempotency: return existing booking if key already used
    const { data: existing } = await supabase
      .from('bookings')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    if (existing) {
      return jsonResponse({ bookingId: existing.id, idempotent: true });
    }

    // Atomically consume upload session (conditional update returns 0 rows if already consumed)
    const { data: consumed, error: consumeErr } = await supabase
      .from('upload_sessions')
      .update({ status: 'consumed' })
      .eq('id', sessionId)
      .eq('status', 'active')
      .select('id')
      .maybeSingle();

    if (consumeErr || !consumed) {
      return errorResponse('Upload session is invalid, already used, or expired');
    }

    // Check expiration (status was active, but may have passed expiry)
    const { data: session } = await supabase
      .from('upload_sessions')
      .select('expires_at')
      .eq('id', sessionId)
      .single();

    if (session && new Date(session.expires_at) < new Date()) {
      // Roll back consumption
      await supabase.from('upload_sessions').update({ status: 'expired' }).eq('id', sessionId);
      return errorResponse('Upload session has expired. Please start over.');
    }

    // Get photos from session
    const { data: sessionPhotos } = await supabase
      .from('session_photos')
      .select('storage_path, file_name, content_type, size_bytes, sort_order')
      .eq('session_id', sessionId)
      .order('sort_order');

    // Resolve business_id from the upload session
    const { data: sessionBiz } = await supabase
      .from('upload_sessions')
      .select('business_id')
      .eq('id', sessionId)
      .single();
    const businessId = sessionBiz?.business_id;
    if (!businessId) {
      return errorResponse('Unable to determine business context', 400);
    }

    // Create booking
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .insert({
        business_id: businessId,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: body.customerEmail || null,
        address,
        city,
        state: body.state || null,
        zip,
        full_address: fullAddress,
        quantity: body.quantity || null,
        access_type: body.accessType || null,
        stairs: body.stairs || null,
        elevator: body.elevator || null,
        description: body.description || null,
        detected_items: body.detectedItems || [],
        ai_detected_items: body.aiDetectedItems || [],
        photo_count: sessionPhotos?.length || 0,
        preferred_date: body.preferredDate || null,
        second_choice_date: body.secondChoiceDate || null,
        time_preference: body.timePreference || null,
        upload_session_id: sessionId,
        idempotency_key: idempotencyKey,
        test_run_id: testRunId,
      })
      .select('id')
      .single();

    if (bookingErr) {
      console.error('Booking creation error:', bookingErr);
      // If idempotency_key unique constraint violation, fetch existing
      if (bookingErr.code === '23505' && bookingErr.message?.includes('idempotency_key')) {
        const { data: retry } = await supabase
          .from('bookings')
          .select('id')
          .eq('idempotency_key', idempotencyKey)
          .single();
        if (retry) return jsonResponse({ bookingId: retry.id, idempotent: true });
      }
      return errorResponse('Failed to create booking', 500);
    }

    // Link session photos to booking
    if (sessionPhotos?.length > 0) {
      const photoRecords = sessionPhotos.map(p => ({
        booking_id: booking.id,
        storage_path: p.storage_path,
        file_name: p.file_name,
        content_type: p.content_type,
        size_bytes: p.size_bytes,
        sort_order: p.sort_order,
      }));

      const { error: linkErr } = await supabase
        .from('booking_photos')
        .insert(photoRecords);

      if (linkErr) {
        console.error('Photo linking error:', linkErr);
      }
    }

    // Set consumed_by_booking reference
    await supabase
      .from('upload_sessions')
      .update({ consumed_by_booking: booking.id })
      .eq('id', sessionId);

    // Audit log
    await supabase.from('audit_log').insert({
      booking_id: booking.id,
      business_id: businessId,
      event_type: 'booking_created',
      metadata: {
        ip_address: ip,
        session_id: sessionId,
        photo_count: sessionPhotos?.length || 0,
      },
    });

    // Send confirmation email if customer provided an email address
    const customerEmail = body.customerEmail;
    if (customerEmail) {
      const resendKey = process.env.RESEND_API_KEY;
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@squatterz.com';
      const confirmationCode = `#${booking.id.slice(0, 8).toUpperCase()}`;

      if (resendKey) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: `Squatterz <${fromEmail}>`,
            to: [customerEmail],
            subject: `Request received – ${confirmationCode}`,
            html: `
              <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0f0d;color:#fff;border-radius:12px;">
                <div style="text-align:center;margin-bottom:32px;">
                  <span style="font-size:20px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;">SQUATTERZ</span>
                  <div style="color:#22c55e;font-size:10px;letter-spacing:0.2em;font-weight:600;text-transform:uppercase;margin-top:4px;">We Haul It All</div>
                </div>
                <div style="background:#22c55e;border-radius:50%;width:56px;height:56px;margin:0 auto 24px;display:flex;align-items:center;justify-content:center;text-align:center;">
                  <span style="font-size:28px;line-height:56px;">✓</span>
                </div>
                <h1 style="font-size:22px;font-weight:900;margin:0 0 12px;text-align:center;">Request received!</h1>
                <p style="color:rgba(255,255,255,0.55);font-size:14px;line-height:1.6;margin:0 0 24px;text-align:center;">
                  Hi${body.customerName ? ` ${body.customerName.split(' ')[0]}` : ''},<br><br>
                  We've got your request and a real person is reviewing it now. Most customers hear back within a few hours.
                </p>
                <div style="background:#111;border:1px solid #222;border-radius:10px;padding:16px 20px;margin-bottom:28px;">
                  <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                    <span style="color:rgba(255,255,255,0.4);font-size:13px;">Confirmation</span>
                    <span style="color:#22c55e;font-family:monospace;font-weight:700;font-size:13px;">${confirmationCode}</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;">
                    <span style="color:rgba(255,255,255,0.4);font-size:13px;">Status</span>
                    <span style="color:#fff;font-size:13px;font-weight:600;">Under review</span>
                  </div>
                </div>
                <p style="color:rgba(255,255,255,0.3);font-size:12px;line-height:1.5;text-align:center;">
                  Keep this confirmation number handy — we may reference it when we reach out.<br>
                  Questions? Call us at (813) 555-0123.
                </p>
              </div>
            `,
          }),
        }).catch(err => console.error('Confirmation email failed (non-fatal):', err.message));
      }
    }

    // Fire-and-forget lead notification email to the business operator
    try {
      const { data: bizSettings } = await supabase
        .from('businesses')
        .select('name, settings, owner_user_id')
        .eq('id', businessId)
        .single();

      const qfc = bizSettings?.settings?.quoteFormConfig;
      if (qfc?.notifications?.emailOnRequest) {
        let notifyEmail = qfc.notifications.notifyEmail;
        if (!notifyEmail && bizSettings?.owner_user_id) {
          const { data: ownerData } = await supabase.auth.admin.getUserById(bizSettings.owner_user_id);
          notifyEmail = ownerData?.user?.email;
        }
        if (notifyEmail) {
          const resendKey = process.env.RESEND_API_KEY;
          const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@myrivet.io';
          if (resendKey) {
            fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                from: `Rivet <${fromEmail}>`,
                to: [notifyEmail],
                subject: `New quote request from ${customerName} in ${city}`,
                html: `
                  <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;">
                    <h2 style="margin:0 0 16px;">New Quote Request</h2>
                    <p><strong>${customerName}</strong> submitted a quote request${city ? ` in ${city}` : ''}.</p>
                    <p style="margin-top:16px;"><a href="${process.env.URL || 'https://myrivet.io'}/admin" style="background:#22c55e;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:bold;">Review in Rivet</a></p>
                  </div>
                `,
              }),
            }).catch(err => console.error('Lead notification email failed (non-fatal):', err.message));
          }
        }
      }
    } catch (err) {
      console.error('Lead notification lookup failed (non-fatal):', err.message);
    }

    // Fire-and-forget geocoding (non-blocking — failure does not affect booking creation)
    const siteUrl = process.env.URL || '';
    if (siteUrl && process.env.SHOP_LAT && process.env.SHOP_LNG) {
      fetch(`${siteUrl}/api/geocode-booking`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId: booking.id }),
      }).catch(err => console.error('Geocode fire-and-forget failed (non-fatal):', err.message));
    }

    return jsonResponse({ bookingId: booking.id }, 201);
  } catch (e) {
    console.error('create-booking error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/create-booking' };
