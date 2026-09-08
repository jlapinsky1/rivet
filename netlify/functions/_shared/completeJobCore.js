/**
 * Core job-completion logic shared by complete-job.js (admin) and
 * dispatch-complete.js (dispatch interface).
 *
 * Resumable and idempotent: each step checks whether it has already been
 * executed and continues from the first incomplete step.  A partial failure
 * (e.g. Stripe timeout, email delivery error) can be retried without creating
 * duplicate completion records, PaymentIntents, access tokens, or emails.
 */

import { getStripeClient, ikey } from './stripe.js';
import { generateToken, sha256 } from './supabase.js';

/**
 * @param {object} opts
 * @param {object} opts.supabase         Service-role Supabase client
 * @param {object} opts.admin            Verified admin user object
 * @param {string} opts.bookingId
 * @param {string} opts.completedAt      ISO datetime string
 * @param {string} opts.technicianName
 * @param {string} [opts.technicianId]
 * @param {string} opts.itemsRemoved
 * @param {string} [opts.volumeEstimate]
 * @param {string} opts.completionNotes
 * @param {string} [opts.disposalNotes]
 * @param {string[]} opts.afterPhotoStoragePaths   Validated server-side paths
 * @param {number}  opts.finalAmountCents           Positive integer
 * @param {string}  [opts.priceAdjustmentReason]
 *
 * @returns {Promise<{
 *   success: boolean,
 *   completionId: string,
 *   idempotent: boolean,
 *   amountRemainingCents: number|null,
 *   finalPaymentLinkSent: boolean,
 * }>}
 */
export async function runCompleteJob({
  supabase,
  admin,
  bookingId,
  completedAt,
  technicianName,
  technicianId,
  itemsRemoved,
  volumeEstimate,
  completionNotes,
  disposalNotes,
  afterPhotoStoragePaths,
  finalAmountCents,
  priceAdjustmentReason,
}) {
  // ── Step 1: Save completion record (skip if already exists) ─────────────────
  let completionId;
  let isIdempotent = false;

  const { data: existingCompletion } = await supabase
    .from('booking_completions')
    .select('id')
    .eq('booking_id', bookingId)
    .maybeSingle();

  // Resolve business_id for child record inserts
  const { data: bookingBiz } = await supabase
    .from('bookings')
    .select('business_id')
    .eq('id', bookingId)
    .single();
  const businessId = bookingBiz?.business_id;

  if (existingCompletion) {
    completionId = existingCompletion.id;
    isIdempotent = true;
  } else {
    const { data: completion, error: completionErr } = await supabase
      .from('booking_completions')
      .insert({
        booking_id:              bookingId,
        business_id:             businessId,
        completed_at:            completedAt,
        technician_name:         technicianName.trim(),
        technician_id:           technicianId?.trim() || null,
        items_removed:           itemsRemoved.trim(),
        volume_estimate:         volumeEstimate?.trim() || null,
        completion_notes:        completionNotes.trim(),
        disposal_notes:          disposalNotes?.trim() || null,
        final_amount_cents:      finalAmountCents,
        price_adjustment_reason: priceAdjustmentReason?.trim() || null,
        admin_id:                admin.id,
      })
      .select('id')
      .single();

    if (completionErr) {
      console.error('runCompleteJob: failed to save completion record:', completionErr);
      throw new Error('Failed to save completion data');
    }
    completionId = completion.id;
  }

  // ── Step 2: Save after photos (skip if already exist for this booking) ───────
  if (!isIdempotent && afterPhotoStoragePaths && afterPhotoStoragePaths.length > 0) {
    const { count: existingAfterCount } = await supabase
      .from('booking_photos')
      .select('id', { count: 'exact', head: true })
      .eq('booking_id', bookingId)
      .eq('kind', 'after')
      .eq('source', 'crew');

    if ((existingAfterCount || 0) === 0) {
      const photoRows = afterPhotoStoragePaths.map((storagePath, i) => ({
        booking_id:   bookingId,
        storage_path: storagePath,
        kind:         'after',
        source:       'crew',
        sort_order:   i,
      }));
      await supabase.from('booking_photos').insert(photoRows);
    }
  }

  // ── Step 3: Update booking status to completed ───────────────────────────────
  await supabase
    .from('bookings')
    .update({
      status:       'completed',
      completed_at: completedAt,
      actuals: {
        finalAmount:      finalAmountCents / 100,
        finalAmountCents,
        itemsRemoved,
        completionNotes,
      },
    })
    .eq('id', bookingId)
    .neq('status', 'completed'); // idempotent — no-op if already completed

  // ── Step 4: Update slot reservation ─────────────────────────────────────────
  await supabase
    .from('slot_reservations')
    .update({ status: 'completed' })
    .eq('booking_id', bookingId)
    .in('status', ['reserved', 'confirmed']);

  // ── Step 5: Audit log — booking_completed (skip if already logged) ───────────
  if (!isIdempotent) {
    await supabase.from('audit_log').insert({
      booking_id:  bookingId,
      business_id: businessId,
      event_type:  'booking_completed',
      admin_id:    admin.id,
      after_value: { finalAmountCents, completionId },
    });
  }

  // ── Steps 6–9: Stripe final payment + email ──────────────────────────────────
  // Re-load booking to get current Stripe state (may have changed in step 3)
  const { data: booking } = await supabase
    .from('bookings')
    .select(
      'stripe_invoice_id, stripe_customer_id, stripe_final_payment_intent_id, ' +
      'customer_email, customer_name'
    )
    .eq('id', bookingId)
    .single();

  let amountRemainingCents = null;
  let finalPaymentLinkSent = false;

  if (booking?.stripe_invoice_id) {
    try {
      const stripe = getStripeClient();

      // Load live invoice for authoritative amount_remaining
      const invoice = await stripe.invoices.retrieve(booking.stripe_invoice_id);
      amountRemainingCents = invoice.amount_remaining;

      // Step 6: Create final PaymentIntent (skip if already exists)
      if (amountRemainingCents > 0 && !booking.stripe_final_payment_intent_id) {
        const finalPi = await stripe.paymentIntents.create(
          {
            amount:   amountRemainingCents,
            currency: 'usd',
            customer: booking.stripe_customer_id,
            payment_method_types: ['card'],
            metadata: {
              booking_id:    bookingId,
              invoice_id:    booking.stripe_invoice_id,
              payment_stage: 'final',
              environment:   process.env.NODE_ENV || 'production',
            },
          },
          { idempotencyKey: ikey.finalPI(bookingId) }
        );

        // Step 7: Attach to invoice (idempotent Stripe call)
        await stripe.invoices.attachPayment(booking.stripe_invoice_id, {
          payment_intent: finalPi.id,
        });

        // Save final PI ID so retries skip steps 6–7
        await supabase
          .from('bookings')
          .update({ stripe_final_payment_intent_id: finalPi.id })
          .eq('id', bookingId);

        await supabase.from('audit_log').insert({
          booking_id: bookingId,
          business_id: businessId,
          event_type: 'final_payment_requested',
          admin_id:   admin.id,
          metadata: {
            final_payment_intent_id:  finalPi.id,
            amount_remaining_cents:   amountRemainingCents,
          },
        });

        // Reload so step 8 can see the new PI id
        booking.stripe_final_payment_intent_id = finalPi.id;
      }

      if (amountRemainingCents > 0 && booking.stripe_final_payment_intent_id) {
        // Step 8: Generate payment access token (skip if active token already exists)
        const { data: existingToken } = await supabase
          .from('payment_access_tokens')
          .select('id')
          .eq('booking_id', bookingId)
          .eq('purpose', 'final_payment')
          .is('revoked_at', null)
          .maybeSingle();

        if (!existingToken) {
          const rawPaymentToken = generateToken();
          const paymentTokenHash = await sha256(rawPaymentToken);
          const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

          await supabase.from('payment_access_tokens').insert({
            booking_id: bookingId,
            business_id: businessId,
            token_hash: paymentTokenHash,
            purpose:    'final_payment',
            expires_at: tokenExpiry,
          });

          // Step 9: Send customer email (only when token was just created)
          if (booking.customer_email) {
            finalPaymentLinkSent = await sendCompletionAndFinalPaymentEmail(
              booking,
              rawPaymentToken,
              amountRemainingCents
            );
          }
        } else {
          // Token exists — email was already sent on a previous attempt
          finalPaymentLinkSent = true;
        }
      } else if (amountRemainingCents === 0) {
        // Already fully paid
        await supabase
          .from('bookings')
          .update({ financially_completed_at: new Date().toISOString() })
          .eq('id', bookingId);
      }
    } catch (stripeErr) {
      console.error('runCompleteJob: Stripe step failed:', stripeErr.message, { bookingId });
      // Non-fatal: completion record is saved; retry will continue from step 6
    }
  }

  return {
    success:              true,
    completionId,
    idempotent:           isIdempotent,
    amountRemainingCents,
    finalPaymentLinkSent,
  };
}

export async function sendCompletionAndFinalPaymentEmail(booking, rawPaymentToken, amountRemainingCents) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return false;

  const baseUrl = process.env.URL || 'https://squatterz.com';
  const finalPageUrl = `${baseUrl}/invoice/${rawPaymentToken}/final`;
  const remainingDollars = (amountRemainingCents / 100).toFixed(2);
  const firstName = booking.customer_name?.split(' ')[0] || 'there';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:    process.env.RESEND_FROM_EMAIL || 'noreply@squatterz.com',
        to:      booking.customer_email,
        subject: 'Your job is complete: view photos and pay the remaining balance',
        html: `<p>Hi ${firstName},</p>
<p>Great news! Your junk removal job is complete.</p>
<p>Click the link below to view your completion report (including before &amp; after photos) and pay the remaining balance of <strong>$${remainingDollars}</strong>.</p>
<p><a href="${finalPageUrl}" style="background:#22c55e;color:#000;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">View Job Report &amp; Pay $${remainingDollars}</a></p>
<p>This link is secure and expires in 7 days.</p>
<p>Thank you for choosing Squatterz!</p>`,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error('sendCompletionAndFinalPaymentEmail: failed:', e.message);
    return false;
  }
}
