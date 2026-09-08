import { getServiceClient } from './_shared/supabase.js';
import { getStripeClient, calculateDepositCents } from './_shared/stripe.js';
// Note: calculateDepositCents is used for both residential and commercial deposit handling

// Must NOT use jsonResponse helper — Stripe expects specific response shapes
function respond(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return respond({ error: 'Method not allowed' }, 405);
  }

  // ── Read raw body for signature verification ──────────────────────────────
  // Must use raw bytes — never parse as JSON first
  let rawBody;
  try {
    rawBody = Buffer.from(await req.arrayBuffer());
  } catch (e) {
    console.error('Failed to read raw body:', e.message);
    return respond({ error: 'Bad request' }, 400);
  }

  const sig = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return respond({ error: 'Bad request' }, 400);
  }

  const stripe = getStripeClient();

  // ── Verify Stripe signature ───────────────────────────────────────────────
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (e) {
    // Log only non-sensitive info; never log raw body or secrets
    console.error('Webhook signature verification failed:', e.message);
    return respond({ error: 'Bad request' }, 400);
  }

  const supabase = getServiceClient();

  // ── Idempotency: mark event as processing ────────────────────────────────
  // An event is only marked 'processed' after ALL business updates succeed.
  // Failed events remain 'failed' and are retried on next Stripe delivery.
  let isRetry = false;
  try {
    const { error: insertErr } = await supabase
      .from('processed_stripe_events')
      .insert({
        stripe_event_id: event.id,
        event_type: event.type,
        processing_status: 'processing',
      });

    if (insertErr) {
      if (insertErr.code === '23505') {
        // Duplicate key — event already seen
        const { data: existing } = await supabase
          .from('processed_stripe_events')
          .select('processing_status')
          .eq('stripe_event_id', event.id)
          .single();

        if (existing?.processing_status === 'processed') {
          return respond({ received: true, idempotent: true });
        }
        if (existing?.processing_status === 'processing') {
          // Another instance is handling this — safe to return OK
          return respond({ received: true });
        }
        if (existing?.processing_status === 'failed') {
          // Retry allowed: reset to processing, increment attempt count
          await supabase
            .from('processed_stripe_events')
            .update({
              processing_status: 'processing',
              last_attempted_at: new Date().toISOString(),
              error_message: null,
            })
            .eq('stripe_event_id', event.id);

          // Increment attempt_count separately (avoid race)
          try {
            await supabase.rpc('increment_webhook_attempt', { p_event_id: event.id });
          } catch (_) {} // best-effort; not critical

          isRetry = true;
        }
      } else {
        console.error('Failed to record webhook event:', insertErr);
        // Continue processing despite DB error — don't return 500 to Stripe
      }
    }
  } catch (idempErr) {
    console.error('Idempotency check error:', idempErr.message);
  }

  // ── Route by event type ───────────────────────────────────────────────────
  let processingError = null;

  try {
    switch (event.type) {
      case 'invoice_payment.paid': {
        // Route by metadata: booking_id = residential, job_id = commercial
        const invPayment = event.data.object;
        const inv = await stripe.invoices.retrieve(invPayment.invoice);
        if (inv.metadata?.booking_id) {
          await handleInvoicePaymentPaid(stripe, supabase, event);
        } else if (inv.metadata?.job_id) {
          await handleCommercialInvoicePaymentPaid(supabase, inv, invPayment);
        }
        break;
      }

      case 'invoice.paid': {
        const inv = event.data.object;
        if (inv.metadata?.booking_id) {
          await handleInvoicePaid(stripe, supabase, event);
        } else if (inv.metadata?.job_id) {
          await handleCommercialInvoicePaid(supabase, inv);
        }
        break;
      }

      case 'payment_intent.payment_failed':
        await handlePaymentFailed(supabase, event);
        break;

      default:
        // Unhandled event type — acknowledge without error
        break;
    }
  } catch (e) {
    processingError = e;
    console.error(`Webhook handler error for ${event.type}:`, e.message, {
      eventId: event.id,
    });
  }

  // ── Mark event processed or failed ───────────────────────────────────────
  if (processingError) {
    try {
      await supabase
        .from('processed_stripe_events')
        .update({
          processing_status: 'failed',
          error_message: processingError.message?.slice(0, 500) || 'Unknown error',
        })
        .eq('stripe_event_id', event.id);
    } catch (e) {
      console.error('Failed to mark event failed:', e.message);
    }

    // Return 500 so Stripe retries this webhook
    return respond({ error: 'Processing failed' }, 500);
  }

  try {
    await supabase
      .from('processed_stripe_events')
      .update({
        processing_status: 'processed',
        processed_at: new Date().toISOString(),
      })
      .eq('stripe_event_id', event.id);
  } catch (e) {
    console.error('Failed to mark event processed:', e.message);
  }

  return respond({ received: true });
}

// ── Handler: invoice_payment.paid ─────────────────────────────────────────

async function handleInvoicePaymentPaid(stripe, supabase, event) {
  const invoicePayment = event.data.object;

  // Load the full invoice to get metadata and totals
  const invoice = await stripe.invoices.retrieve(invoicePayment.invoice);

  const bookingId = invoice.metadata?.booking_id;
  if (!bookingId) {
    console.error('invoice_payment.paid: missing booking_id in invoice metadata', {
      invoiceId: invoice.id,
      eventId: event.id,
    });
    return; // Not our invoice
  }

  // Load booking from trusted DB (never trust client-supplied data)
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select(
      'id, business_id, status, stripe_invoice_id, stripe_customer_id, ' +
      'stripe_deposit_payment_intent_id, stripe_final_payment_intent_id, ' +
      'deposit_confirmed_at, financially_completed_at, quote_token_hash'
    )
    .eq('id', bookingId)
    .single();

  if (bookingErr || !booking) {
    throw new Error(`Booking not found: ${bookingId}`);
  }

  // Verify invoice ownership
  if (booking.stripe_invoice_id !== invoice.id) {
    console.error('invoice_payment.paid: invoice ID mismatch', {
      expected: booking.stripe_invoice_id,
      got: invoice.id,
      bookingId,
    });
    return; // Ignore — not our invoice
  }

  if (invoice.customer !== booking.stripe_customer_id) {
    console.error('invoice_payment.paid: customer mismatch', {
      expected: booking.stripe_customer_id,
      got: invoice.customer,
      bookingId,
    });
    return;
  }

  if (invoicePayment.currency !== 'usd') {
    throw new Error(`Unexpected currency: ${invoicePayment.currency}`);
  }

  const piId = invoicePayment.payment?.payment_intent;
  const amountPaid = invoicePayment.amount_paid;
  const requiredDepositCents = calculateDepositCents(invoice.amount_due);

  // Determine payment stage
  const isDepositPI = piId === booking.stripe_deposit_payment_intent_id;
  const isFinalPI = piId === booking.stripe_final_payment_intent_id;

  if (isDepositPI || (!booking.deposit_confirmed_at && !isFinalPI)) {
    // Deposit confirmation path
    if (amountPaid === requiredDepositCents) {
      // Standard deposit
      const { data: confirmResult } = await supabase.rpc('confirm_deposit_atomic', {
        p_booking_id: bookingId,
        p_deposit_payment_intent_id: piId,
        p_invoice_payment_id: invoicePayment.id,
        p_token_hash: booking.quote_token_hash || null,
      });

      if (confirmResult?.success && !confirmResult?.idempotent) {
        await sendDepositConfirmationEmail(supabase, booking);
      }

    } else if (amountPaid >= invoice.amount_due) {
      // Customer paid full amount early (e.g., via hosted invoice page)
      // Treat as both deposit + financial completion
      const { data: confirmResult } = await supabase.rpc('confirm_deposit_atomic', {
        p_booking_id: bookingId,
        p_deposit_payment_intent_id: piId,
        p_invoice_payment_id: invoicePayment.id,
        p_token_hash: booking.quote_token_hash || null,
      });

      if (confirmResult?.success && !booking.financially_completed_at) {
        await supabase
          .from('bookings')
          .update({ financially_completed_at: new Date().toISOString() })
          .eq('id', bookingId);

        await supabase.from('audit_log').insert({
          booking_id: bookingId,
          business_id: booking.business_id,
          event_type: 'final_payment_confirmed',
          metadata: {
            payment_intent_id: piId,
            invoice_payment_id: invoicePayment.id,
            early_full_payment: true,
          },
        });
      }

    } else {
      // Underpayment — do not confirm deposit; log for admin review
      console.error('Deposit underpayment detected', {
        bookingId,
        required: requiredDepositCents,
        received: amountPaid,
        eventId: event.id,
      });
      // Leave booking in awaiting_deposit; admin reconciliation required
    }

  } else if (isFinalPI) {
    // Final payment confirmation (backup — primary is invoice.paid)
    if (!booking.financially_completed_at && invoice.amount_remaining === 0) {
      await supabase
        .from('bookings')
        .update({ financially_completed_at: new Date().toISOString() })
        .eq('id', bookingId);

      await supabase.from('audit_log').insert({
        booking_id: bookingId,
        business_id: booking.business_id,
        event_type: 'final_payment_confirmed',
        metadata: {
          payment_intent_id: piId,
          invoice_payment_id: invoicePayment.id,
        },
      });
    }
  }
}

// ── Handler: invoice.paid ─────────────────────────────────────────────────
// Primary event for financial completion (invoice.amount_remaining === 0)

async function handleInvoicePaid(stripe, supabase, event) {
  const invoice = event.data.object;

  if (invoice.amount_remaining !== 0) {
    return; // Guard — shouldn't happen for invoice.paid but be safe
  }

  const bookingId = invoice.metadata?.booking_id;
  if (!bookingId) return;

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, business_id, stripe_invoice_id, financially_completed_at')
    .eq('id', bookingId)
    .single();

  if (bookingErr || !booking || booking.stripe_invoice_id !== invoice.id) return;

  if (booking.financially_completed_at) {
    return; // Already marked
  }

  await supabase
    .from('bookings')
    .update({ financially_completed_at: new Date().toISOString() })
    .eq('id', bookingId);

  // Consume the payment access token
  await supabase
    .from('payment_access_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .is('used_at', null);

  await supabase.from('audit_log').insert({
    booking_id: bookingId,
    business_id: booking.business_id,
    event_type: 'final_payment_confirmed',
    metadata: {
      invoice_id: invoice.id,
      amount_paid: invoice.amount_paid,
    },
  });

  await sendFinalPaidReceiptEmail(supabase, booking);
}

// ── Handler: payment_intent.payment_failed ────────────────────────────────
// Card declined — do NOT cancel slot reservation.
// Customer can retry; slot expires naturally after 30 minutes.

async function handlePaymentFailed(supabase, event) {
  const pi = event.data.object;
  const bookingId = pi.metadata?.booking_id;

  if (!bookingId || pi.metadata?.payment_stage !== 'deposit') return;

  // Look up business_id for audit entry
  const { data: failedBooking } = await supabase
    .from('bookings')
    .select('business_id')
    .eq('id', bookingId)
    .single();

  // Audit only — booking stays in awaiting_deposit for retry
  await supabase.from('audit_log').insert({
    booking_id: bookingId,
    business_id: failedBooking?.business_id,
    event_type: 'deposit_failed',
    metadata: {
      payment_intent_id: pi.id,
      failure_code: pi.last_payment_error?.code,
      failure_message: pi.last_payment_error?.message?.slice(0, 200),
    },
  });
}

// ── Email helpers ─────────────────────────────────────────────────────────

async function sendDepositConfirmationEmail(supabase, booking) {
  // Load customer email from booking
  const { data: fullBooking } = await supabase
    .from('bookings')
    .select('customer_email, customer_name, scheduled_pickup')
    .eq('id', booking.id)
    .single();

  if (!fullBooking?.customer_email) return;

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@squatterz.com',
        to: fullBooking.customer_email,
        subject: 'Your deposit is confirmed — appointment scheduled',
        html: `<p>Hi ${fullBooking.customer_name?.split(' ')[0] || 'there'},</p>
<p>Your 50% deposit has been received and your appointment is confirmed.</p>
${fullBooking.scheduled_pickup ? `<p><strong>Pickup:</strong> ${fullBooking.scheduled_pickup}</p>` : ''}
<p>We'll be in touch with more details. Thank you for choosing Squatterz!</p>`,
      }),
    });
  } catch (e) {
    console.error('Failed to send deposit confirmation email:', e.message);
  }
}

async function sendFinalPaidReceiptEmail(supabase, booking) {
  const { data: fullBooking } = await supabase
    .from('bookings')
    .select('customer_email, customer_name')
    .eq('id', booking.id)
    .single();

  if (!fullBooking?.customer_email) return;

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@squatterz.com',
        to: fullBooking.customer_email,
        subject: 'Payment received — thank you!',
        html: `<p>Hi ${fullBooking.customer_name?.split(' ')[0] || 'there'},</p>
<p>Your final payment has been received. Your job is fully paid — thank you!</p>
<p>If you have any questions, don't hesitate to reach out.</p>`,
      }),
    });
  } catch (e) {
    console.error('Failed to send final receipt email:', e.message);
  }
}

// ── Commercial: invoice_payment.paid ─────────────────────────────────────

async function handleCommercialInvoicePaymentPaid(supabase, invoice, invoicePayment) {
  const jobId = invoice.metadata?.job_id;
  if (!jobId) return;

  const { data: job, error } = await supabase
    .from('jobs')
    .select('id, status, stripe_invoice_id, stripe_deposit_payment_intent_id, deposit_confirmed_at')
    .eq('id', jobId)
    .single();

  if (error || !job) throw new Error(`Commercial job not found: ${jobId}`);
  if (job.stripe_invoice_id !== invoice.id) return; // Not our invoice

  const piId = invoicePayment.payment?.payment_intent;
  const amountPaid = invoicePayment.amount_paid;
  const requiredDeposit = calculateDepositCents(invoice.amount_due);

  const isDepositPI = piId === job.stripe_deposit_payment_intent_id;

  if ((isDepositPI || !job.deposit_confirmed_at) && amountPaid >= requiredDeposit) {
    // Confirm deposit → move to scheduled
    if (!job.deposit_confirmed_at) {
      await supabase
        .from('jobs')
        .update({
          status: 'scheduled',
          deposit_confirmed_at: new Date().toISOString(),
          stripe_deposit_payment_intent_id: piId || job.stripe_deposit_payment_intent_id,
        })
        .eq('id', jobId);

      // Notify admin
      const adminEmail = process.env.ADMIN_EMAIL;
      const resendKey = process.env.RESEND_API_KEY;
      if (adminEmail && resendKey) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: `Squatterz <${process.env.RESEND_FROM_EMAIL || 'noreply@squatterz.com'}>`,
            to: [adminEmail],
            subject: `Commercial deposit received — job ${jobId.slice(0, 8).toUpperCase()}`,
            html: `<p>Deposit confirmed for commercial job ${jobId}. Job is now scheduled.</p>
                   <p><a href="${process.env.URL || ''}/admin/commercial">View in admin →</a></p>`,
          }),
        }).catch(e => console.error('Admin deposit notification failed:', e.message));
      }
    }
  }
}

// ── Commercial: invoice.paid (final payment) ──────────────────────────────

async function handleCommercialInvoicePaid(supabase, invoice) {
  const jobId = invoice.metadata?.job_id;
  if (!jobId || invoice.amount_remaining !== 0) return;

  const { data: job } = await supabase
    .from('jobs')
    .select('id, stripe_invoice_id, financially_completed_at')
    .eq('id', jobId)
    .single();

  if (!job || job.stripe_invoice_id !== invoice.id || job.financially_completed_at) return;

  await supabase
    .from('jobs')
    .update({ financially_completed_at: new Date().toISOString() })
    .eq('id', jobId);
}

export const config = {
  path: '/api/stripe-webhook',
  // Netlify Functions v2: preserve raw body for signature verification
};
