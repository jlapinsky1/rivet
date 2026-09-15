import { getServiceClient, sha256, jsonResponse, errorResponse } from './_shared/supabase.js';

export default async function handler(req) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  try {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');

    if (!token) {
      return errorResponse('Unable to process this request');
    }

    const tokenHash = await sha256(token);
    const supabase = getServiceClient();

    // Look up token - generic error for all failure modes
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('quote_tokens')
      .select('id, booking_id, quote_snapshot_id, expires_at, revoked_at, used_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (tokenErr || !tokenRow) {
      return errorResponse('Unable to process this request');
    }

    if (tokenRow.revoked_at || tokenRow.used_at || new Date(tokenRow.expires_at) < new Date()) {
      return errorResponse('This quote is no longer available');
    }

    // Get snapshot - explicit allowlist, no internal fields
    const { data: snapshot, error: snapErr } = await supabase
      .from('quote_snapshots')
      .select('approved_price, version, expires_at, available_slots, customer_terms')
      .eq('id', tokenRow.quote_snapshot_id)
      .single();

    if (snapErr || !snapshot) {
      return errorResponse('Unable to process this request');
    }

    // Get booking (limited fields only - no internal data)
    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .select('id, customer_name, status, full_address, quantity, description, preferred_date, second_choice_date, time_preference')
      .eq('id', tokenRow.booking_id)
      .single();

    if (bookErr || !booking) {
      return errorResponse('Unable to process this request');
    }

    // Get booked slots for the available dates so UI can filter
    const dates = (snapshot.available_slots || []).map(s => s.date).filter(Boolean);
    let bookedSlots = [];
    if (dates.length > 0) {
      const { data: reservations } = await supabase
        .from('slot_reservations')
        .select('resource_id, pickup_date, start_time')
        .in('pickup_date', dates)
        .in('status', ['reserved', 'confirmed']);
      bookedSlots = reservations || [];
    }

    // Return customer-safe DTO
    return jsonResponse({
      booking: {
        id: booking.id,
        customerName: booking.customer_name,
        status: booking.status,
        address: booking.full_address,
        quantity: booking.quantity,
        description: booking.description,
        preferredDate: booking.preferred_date,
        secondChoiceDate: booking.second_choice_date,
        timePreference: booking.time_preference,
      },
      quote: {
        price: snapshot.approved_price,
        version: snapshot.version,
        expiresAt: snapshot.expires_at,
        availableSlots: snapshot.available_slots,
        customerTerms: snapshot.customer_terms,
      },
      bookedSlots,
    });
  } catch (e) {
    console.error('get-customer-quote error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/get-customer-quote' };
