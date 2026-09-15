import {
  getServiceClient, checkRateLimit, getClientIp, sha256,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';
import {
  getStripeClient, calculateDepositCents, ikey,
} from './_shared/stripe.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const ip = getClientIp(req);
    const supabase = getServiceClient();

    // Rate limit: 10 per IP per hour
    const allowed = await checkRateLimit(supabase, ip, 'create-deposit-payment', 3600, 10);
    if (!allowed) return errorResponse('Too many requests', 429);

    const { token, resourceId, pickupDate, startTime, endTime, confirmations } =
      await req.json();

    if (!token) return errorResponse('token is required');
    if (!pickupDate || !startTime || !endTime) return errorResponse('Slot details are required');
    if (!Array.isArray(confirmations) || confirmations.length < 3) {
      return errorResponse('All three confirmations are required');
    }

    const tokenHash = await sha256(token);

    // Validate token + reserve slot + move booking to awaiting_deposit
    const { data: rpcResult, error: rpcErr } = await supabase.rpc(
      'initiate_payment_atomic',
      {
        p_token_hash: tokenHash,
        p_resource_id: resourceId || 'truck-1',
        p_pickup_date: pickupDate,
        p_start_time: startTime,
        p_end_time: endTime,
        p_confirmations: confirmations,
        p_idempotency_key: `deposit-init-${tokenHash.slice(0, 16)}`,
      }
    );

    if (rpcErr) {
      console.error('initiate_payment_atomic error:', rpcErr);
      return errorResponse('Unable to process this request', 500);
    }

    if (!rpcResult?.success) {
      const msg = rpcResult?.error || 'Unable to process this request';
      // Surface slot-conflict errors specifically; others are generic
      if (msg.includes('time slot was just taken')) {
        return errorResponse(msg, 409);
      }
      if (msg.includes('confirmations are required')) {
        return errorResponse(msg, 400);
      }
      return errorResponse('Unable to process this request', 400);
    }

    const { booking_id: bookingId, approved_price_cents, quote_version: quoteVersion } =
      rpcResult;

    // Load trusted Stripe references from DB (never from client)
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select('stripe_invoice_id, stripe_customer_id, stripe_deposit_payment_intent_id')
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking?.stripe_invoice_id) {
      console.error('Missing Stripe invoice for booking:', bookingId);
      return errorResponse(
        'Payment information is temporarily unavailable. Please try again shortly.',
        503
      );
    }

    const stripe = getStripeClient();

    // Load invoice from Stripe to get the authoritative total
    let invoice;
    try {
      invoice = await stripe.invoices.retrieve(booking.stripe_invoice_id);
    } catch (e) {
      console.error('Failed to retrieve Stripe invoice:', e.message, { bookingId });
      return errorResponse(
        'Payment information is temporarily unavailable. Please try again shortly.',
        503
      );
    }

    // Verify this invoice belongs to the expected booking (ownership check)
    if (invoice.metadata?.booking_id !== bookingId) {
      console.error('Invoice metadata mismatch:', {
        expected: bookingId,
        got: invoice.metadata?.booking_id,
      });
      return errorResponse('Unable to process this request', 400);
    }

    // Calculate deposit server-side from Stripe's authoritative total
    const invoiceTotalCents = invoice.amount_due;
    const depositCents = calculateDepositCents(invoiceTotalCents);

    // Idempotency: return existing PI if already created and still valid
    if (booking.stripe_deposit_payment_intent_id) {
      try {
        const existingPi = await stripe.paymentIntents.retrieve(
          booking.stripe_deposit_payment_intent_id
        );
        if (existingPi.status !== 'canceled') {
          return jsonResponse({
            clientSecret: existingPi.client_secret,
            depositCents,
            invoiceTotalCents,
          });
        }
      } catch {
        // PI not found or error - create a new one below
      }
    }

    // Create standalone PaymentIntent for deposit amount
    let pi;
    try {
      pi = await stripe.paymentIntents.create(
        {
          amount: depositCents,
          currency: 'usd',
          customer: booking.stripe_customer_id,
          payment_method_types: ['card'],
          metadata: {
            booking_id: bookingId,
            invoice_id: booking.stripe_invoice_id,
            payment_stage: 'deposit',
            quote_version: String(quoteVersion),
            environment: process.env.NODE_ENV || 'production',
          },
        },
        { idempotencyKey: ikey.depositPI(bookingId, quoteVersion) }
      );
    } catch (e) {
      console.error('Failed to create deposit PaymentIntent:', e.message, { bookingId });
      return errorResponse(
        'Payment information is temporarily unavailable. Please try again shortly.',
        503
      );
    }

    // Attach PaymentIntent to invoice (partial payment)
    try {
      await stripe.invoices.attachPayment(booking.stripe_invoice_id, {
        payment_intent: pi.id,
      });
    } catch (e) {
      console.error('Failed to attach PaymentIntent to invoice:', e.message, {
        bookingId,
        invoiceId: booking.stripe_invoice_id,
        piId: pi.id,
      });
      // PI was created but not attached - store ID so idempotency key reuses it
      // Webhook will still fire when PI succeeds; reconciliation can fix the attach
    }

    // Save deposit PI ID to booking (may fail; next retry reuses via idempotency key)
    await supabase
      .from('bookings')
      .update({ stripe_deposit_payment_intent_id: pi.id })
      .eq('id', bookingId);

    return jsonResponse({
      clientSecret: pi.client_secret,
      depositCents,
      invoiceTotalCents,
    });

  } catch (e) {
    console.error('create-deposit-payment error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/create-deposit-payment' };
