/**
 * Resends the customer quote email by:
 *   1. Revoking the existing active quote token
 *   2. Generating a new token (same snapshot, new expiry)
 *   3. Updating bookings.quote_token_hash
 *   4. Sending the quote email via Resend
 *
 * Returns the new raw token to the admin so they can also copy the link manually.
 */
import {
  getServiceClient, verifyAdmin, generateToken, sha256,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const admin = await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const { bookingId } = await req.json();
    if (!bookingId) return errorResponse('bookingId required');

    const supabase = getServiceClient();

    // Load booking
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('id, business_id, status, customer_name, customer_email, full_address, approved_quote, quote_expires_at')
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) return errorResponse('Booking not found', 404);
    if (!['quote_sent', 'awaiting_deposit'].includes(booking.status)) {
      return errorResponse('Quote can only be resent for quote_sent or awaiting_deposit bookings', 409);
    }
    if (!booking.customer_email) {
      return errorResponse('No customer email on file for this booking', 422);
    }

    // Find the current active token's snapshot_id (need it to create the replacement)
    const { data: activeToken, error: tokenErr } = await supabase
      .from('quote_tokens')
      .select('id, quote_snapshot_id, expires_at')
      .eq('booking_id', bookingId)
      .is('revoked_at', null)
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenErr) {
      console.error('quote_tokens lookup error:', tokenErr);
      return errorResponse('Failed to look up existing token', 500);
    }

    if (!activeToken) {
      return errorResponse('No active quote token found — the quote may have already been accepted or expired', 422);
    }

    // Generate replacement token
    const rawToken = generateToken();
    const tokenHash = await sha256(rawToken);

    // New expiry: 7 days from now (or keep original if it's further out)
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const newExpiry = booking.quote_expires_at && new Date(booking.quote_expires_at) > new Date(sevenDaysFromNow)
      ? booking.quote_expires_at
      : sevenDaysFromNow;

    // Revoke existing token
    await supabase
      .from('quote_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', activeToken.id);

    // Audit revocation
    await supabase.from('audit_log').insert({
      booking_id: bookingId,
      business_id: booking.business_id,
      event_type: 'token_revoked',
      admin_id: admin.id,
      metadata: { token_id: activeToken.id, reason: 'resend_quote' },
    });

    // Insert new token
    const { error: insertErr } = await supabase
      .from('quote_tokens')
      .insert({
        booking_id: bookingId,
        business_id: booking.business_id,
        quote_snapshot_id: activeToken.quote_snapshot_id,
        token_hash: tokenHash,
        expires_at: newExpiry,
      });

    if (insertErr) {
      console.error('Token insert error:', insertErr);
      return errorResponse('Failed to create replacement token', 500);
    }

    // Update booking with new token hash + refreshed expiry
    await supabase
      .from('bookings')
      .update({
        quote_token_hash: tokenHash,
        quote_expires_at: newExpiry,
      })
      .eq('id', bookingId);

    // Send email
    const siteUrl = process.env.URL || '';
    const quoteUrl = `${siteUrl}/quote/${rawToken}`;
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@squatterz.com';

    if (resendKey) {
      const firstName = booking.customer_name ? booking.customer_name.split(' ')[0] : 'there';
      const priceFormatted = `$${Number(booking.approved_quote).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `Squatterz <${fromEmail}>`,
          to: [booking.customer_email],
          subject: `Your junk removal quote — ${priceFormatted}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0f0d;color:#fff;border-radius:12px;">
              <div style="text-align:center;margin-bottom:32px;">
                <span style="font-size:20px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;">SQUATTERZ</span>
                <div style="color:#22c55e;font-size:10px;letter-spacing:0.2em;font-weight:600;text-transform:uppercase;margin-top:4px;">We Haul It All</div>
              </div>
              <h1 style="font-size:22px;font-weight:900;margin:0 0 12px;">Your quote is ready, ${firstName}!</h1>
              <p style="color:rgba(255,255,255,0.55);font-size:14px;line-height:1.6;margin:0 0 8px;">
                We've reviewed your request for:
              </p>
              <p style="color:#fff;font-size:14px;font-weight:600;margin:0 0 24px;">${booking.full_address}</p>
              <div style="background:#111;border:1px solid #222;border-radius:10px;padding:16px 20px;margin-bottom:28px;text-align:center;">
                <div style="color:rgba(255,255,255,0.4);font-size:12px;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em;">Your firm quote</div>
                <div style="color:#22c55e;font-size:36px;font-weight:900;">${priceFormatted}</div>
                <div style="color:rgba(255,255,255,0.4);font-size:12px;margin-top:4px;">No surprises. Price locked in.</div>
              </div>
              <p style="color:rgba(255,255,255,0.55);font-size:14px;line-height:1.6;margin:0 0 24px;">
                Review your quote, choose a pickup time, and secure your spot with a 50% deposit. The remaining balance is due after the job is complete.
              </p>
              <div style="text-align:center;margin-bottom:28px;">
                <a href="${quoteUrl}" style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:15px;padding:14px 36px;border-radius:10px;text-decoration:none;">
                  Review &amp; Accept Quote
                </a>
              </div>
              <p style="color:rgba(255,255,255,0.3);font-size:12px;line-height:1.5;text-align:center;">
                This link replaces any previously sent quote link.<br>
                Questions? Call us at (813) 555-0123.
              </p>
            </div>
          `,
        }),
      });
    }

    // Audit
    await supabase.from('audit_log').insert({
      booking_id: bookingId,
      business_id: booking.business_id,
      event_type: 'quote_resent',
      admin_id: admin.id,
      metadata: { customer_email: booking.customer_email, new_expiry: newExpiry },
    });

    return jsonResponse({ success: true, quoteToken: rawToken, quoteUrl });

  } catch (e) {
    console.error('resend-quote error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/resend-quote' };
