import {
  getServiceClient, verifyAdmin,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';
import { sendDeclineEmail } from './_shared/declineEmail.js';

const DECLINABLE_STATUSES = ['pending_review', 'quote_sent', 'awaiting_deposit', 'awaiting_payment'];

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const admin = await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const { bookingId, reason } = await req.json();
    if (!bookingId) return errorResponse('bookingId is required');

    const supabase = getServiceClient();

    const { data: booking, error: loadErr } = await supabase
      .from('bookings')
      .select('id, business_id, status, customer_name, customer_email, full_address')
      .eq('id', bookingId)
      .single();

    if (loadErr || !booking) return errorResponse('Booking not found', 404);

    if (booking.status === 'declined') {
      return jsonResponse({ success: true, alreadyDeclined: true });
    }

    if (!DECLINABLE_STATUSES.includes(booking.status)) {
      return errorResponse(`Cannot decline a booking with status "${booking.status}"`, 400);
    }

    const { error: updateErr } = await supabase
      .from('bookings')
      .update({
        status: 'declined',
        quote_token_hash: null,
      })
      .eq('id', bookingId);

    if (updateErr) {
      console.error('decline-booking update error:', updateErr);
      return errorResponse('Failed to decline booking', 500);
    }

    await supabase
      .from('quote_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('booking_id', bookingId)
      .is('used_at', null);

    const emailResult = await sendDeclineEmail({
      to: booking.customer_email,
      firstName: booking.customer_name?.split(' ')[0],
      contextLine: booking.full_address,
      brand: 'residential',
      customMessage: reason || undefined,
      subject: 'Update on your junk removal request',
    });

    await supabase.from('audit_log').insert({
      booking_id: bookingId,
      business_id: booking.business_id,
      event_type: 'booking_declined',
      admin_id: admin.id,
      reason: reason || null,
      metadata: {
        previous_status: booking.status,
        email_sent: emailResult.sent,
        email_error: emailResult.reason || null,
      },
    });

    return jsonResponse({
      success: true,
      emailSent: emailResult.sent,
      emailError: emailResult.reason || null,
    });
  } catch (e) {
    console.error('decline-booking error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/decline-booking' };
