import {
  getServiceClient, sha256, verifyCommercialClient,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';
import { getStripeClient, calculateDepositCents, ikey } from './_shared/stripe.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { token, jobId: bodyJobId } = await req.json();
    const supabase = getServiceClient();

    let job;

    if (token) {
      // Email-link flow
      const tokenHash = await sha256(token);
      const { data, error } = await supabase
        .from('jobs')
        .select('id, status, stripe_invoice_id, stripe_customer_id, stripe_deposit_payment_intent_id')
        .eq('quote_token_hash', tokenHash)
        .single();

      if (error || !data) return errorResponse('Quote not found', 404);
      job = data;
    } else {
      // Portal flow
      const clientAuth = await verifyCommercialClient(req);
      if (!clientAuth) return errorResponse('Unauthorized', 401);
      const { client } = clientAuth;

      if (!bodyJobId) return errorResponse('token or jobId is required');

      const { data, error } = await supabase
        .from('jobs')
        .select(`
          id, status, stripe_invoice_id, stripe_customer_id, stripe_deposit_payment_intent_id,
          properties!inner(client_id)
        `)
        .eq('id', bodyJobId)
        .single();

      if (error || !data) return errorResponse('Job not found', 404);
      if (data.properties.client_id !== client.id) return errorResponse('Unauthorized', 403);
      job = data;
    }

    if (!['awaiting_payment', 'quote_sent'].includes(job.status)) {
      return errorResponse('Job is not awaiting payment', 409);
    }

    if (!job.stripe_invoice_id) {
      return errorResponse('Payment information is not yet available. Please try again shortly.', 503);
    }

    const stripe = getStripeClient();

    // Get authoritative invoice total from Stripe
    let invoice;
    try {
      invoice = await stripe.invoices.retrieve(job.stripe_invoice_id);
    } catch (e) {
      console.error('Failed to retrieve invoice:', e.message);
      return errorResponse('Payment information temporarily unavailable. Please try again shortly.', 503);
    }

    if (invoice.metadata?.job_id !== job.id) {
      return errorResponse('Payment information mismatch', 400);
    }

    const invoiceTotalCents = invoice.amount_due;
    const depositCents = calculateDepositCents(invoiceTotalCents);

    // Idempotency: reuse existing PI if still valid
    if (job.stripe_deposit_payment_intent_id) {
      try {
        const existingPi = await stripe.paymentIntents.retrieve(job.stripe_deposit_payment_intent_id);
        if (existingPi.status !== 'canceled') {
          return jsonResponse({
            clientSecret: existingPi.client_secret,
            depositCents,
            invoiceTotalCents,
          });
        }
      } catch {
        // PI not found - create a new one
      }
    }

    // Create deposit PaymentIntent
    let pi;
    try {
      pi = await stripe.paymentIntents.create(
        {
          amount: depositCents,
          currency: 'usd',
          customer: job.stripe_customer_id,
          payment_method_types: ['card'],
          metadata: {
            job_id: job.id,
            invoice_id: job.stripe_invoice_id,
            payment_stage: 'commercial_deposit',
            environment: process.env.NODE_ENV || 'production',
          },
        },
        { idempotencyKey: ikey.commDepositPI(job.id) }
      );
    } catch (e) {
      console.error('Failed to create deposit PaymentIntent:', e.message);
      return errorResponse('Payment information temporarily unavailable. Please try again shortly.', 503);
    }

    // Attach PI to invoice
    try {
      await stripe.invoices.attachPayment(job.stripe_invoice_id, {
        payment_intent: pi.id,
      });
    } catch (e) {
      console.error('Failed to attach PI to invoice:', e.message);
    }

    // Save PI ID
    await supabase
      .from('jobs')
      .update({ stripe_deposit_payment_intent_id: pi.id })
      .eq('id', job.id);

    return jsonResponse({ clientSecret: pi.client_secret, depositCents, invoiceTotalCents });
  } catch (e) {
    console.error('create-commercial-deposit error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/create-commercial-deposit' };
