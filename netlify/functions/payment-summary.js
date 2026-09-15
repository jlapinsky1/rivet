import {
  getServiceClient, verifyAdmin, sha256,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';
import { getStripeClient, getPaymentSummaryDTO, calculateDepositCents } from './_shared/stripe.js';

export default async function handler(req) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  try {
    const url = new URL(req.url, 'http://localhost');
    const token = url.searchParams.get('token');
    const bookingId = url.searchParams.get('bookingId');

    if (!token && !bookingId) {
      return errorResponse('token or bookingId is required');
    }

    const supabase = getServiceClient();
    const stripe = getStripeClient();

    // ── Admin path: Bearer token + bookingId ─────────────────────────────
    if (bookingId) {
      const admin = await verifyAdmin(req);
      if (!admin) return errorResponse('Unauthorized', 401);

      const { data: booking, error: bookingErr } = await supabase
        .from('bookings')
        .select(
          'id, stripe_invoice_id, stripe_customer_id, ' +
          'stripe_deposit_payment_intent_id, stripe_final_payment_intent_id, ' +
          'deposit_confirmed_at, financially_completed_at, approved_quote'
        )
        .eq('id', bookingId)
        .single();

      if (bookingErr || !booking) return errorResponse('Booking not found', 404);
      if (!booking.stripe_invoice_id) {
        return errorResponse('No Stripe invoice linked to this booking', 404);
      }

      // includeHostedUrl=true for admin
      const dto = await getPaymentSummaryDTO(stripe, booking.stripe_invoice_id, true);

      // Enrich deposit confirmation flag using actual required deposit
      dto.depositConfirmed = booking.deposit_confirmed_at != null;
      dto.depositRequiredCents = calculateDepositCents(dto.invoiceTotalCents);

      return jsonResponse({
        ...dto,
        stripeCustomerId: booking.stripe_customer_id,
        stripeInvoiceId: booking.stripe_invoice_id,
        depositPaymentIntentId: booking.stripe_deposit_payment_intent_id,
        finalPaymentIntentId: booking.stripe_final_payment_intent_id,
        depositConfirmedAt: booking.deposit_confirmed_at,
        financiallyCompletedAt: booking.financially_completed_at,
      });
    }

    // ── Customer path: quote token ────────────────────────────────────────
    const tokenHash = await sha256(token);

    const { data: tokenRow, error: tokenErr } = await supabase
      .from('quote_tokens')
      .select('booking_id, expires_at, revoked_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    // Validate token: must exist and not be revoked or expired
    // Note: used_at is NOT checked here - customer may view payment summary
    // multiple times during and after the payment flow.
    if (tokenErr || !tokenRow || tokenRow.revoked_at || new Date(tokenRow.expires_at) < new Date()) {
      return errorResponse('Unable to process this request', 400);
    }

    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select(
        'id, stripe_invoice_id, stripe_final_payment_intent_id, ' +
        'deposit_confirmed_at, approved_quote'
      )
      .eq('id', tokenRow.booking_id)
      .single();

    if (bookingErr || !booking || !booking.stripe_invoice_id) {
      return errorResponse('Payment information is temporarily unavailable. Please try again shortly.', 503);
    }

    // hostedInvoiceUrl only exposed when final payment has been requested
    const includeHostedUrl = booking.stripe_final_payment_intent_id != null;
    const dto = await getPaymentSummaryDTO(stripe, booking.stripe_invoice_id, includeHostedUrl);

    // Derive deposit confirmed from actual required amount, not amount_paid > 0
    const requiredDepositCents = calculateDepositCents(dto.invoiceTotalCents);
    dto.depositConfirmed = booking.deposit_confirmed_at != null;
    dto.depositRequiredCents = requiredDepositCents;

    return jsonResponse(dto);

  } catch (e) {
    console.error('payment-summary error:', e.message);
    return errorResponse(
      'Payment information is temporarily unavailable. Please try again shortly.',
      503
    );
  }
}

export const config = { path: '/api/payment-summary' };
