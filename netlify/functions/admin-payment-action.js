import {
  getServiceClient, verifyAdmin, generateToken, sha256,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';
import { getStripeClient, getPaymentSummaryDTO, calculateDepositCents } from './_shared/stripe.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const admin = await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const { bookingId, action } = await req.json();
    if (!bookingId) return errorResponse('bookingId is required');
    if (!action) return errorResponse('action is required');

    const supabase = getServiceClient();

    switch (action) {
      case 'refresh_status':
        return await handleRefreshStatus(supabase, bookingId, admin);

      case 'resend_final_link':
        return await handleResendFinalLink(supabase, bookingId, admin);

      case 'reconcile':
        return await handleReconcile(supabase, bookingId, admin, req);

      case 'generate_customer_link':
        return await handleGenerateCustomerLink(supabase, bookingId, admin);

      default:
        return errorResponse(`Unknown action: ${action}`);
    }

  } catch (e) {
    console.error('admin-payment-action error:', e);
    return errorResponse('Server error', 500);
  }
}

// ── refresh_status ─────────────────────────────────────────────────────────
// Returns a fresh payment summary from Stripe alongside DB state.

async function handleRefreshStatus(supabase, bookingId, admin) {
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select(
      'id, stripe_invoice_id, stripe_customer_id, ' +
      'stripe_deposit_payment_intent_id, stripe_final_payment_intent_id, ' +
      'deposit_confirmed_at, financially_completed_at, approved_quote, status'
    )
    .eq('id', bookingId)
    .single();

  if (bookingErr || !booking) return errorResponse('Booking not found', 404);
  if (!booking.stripe_invoice_id) {
    return errorResponse('No Stripe invoice linked to this booking', 404);
  }

  const stripe = getStripeClient();
  const dto = await getPaymentSummaryDTO(stripe, booking.stripe_invoice_id, true);

  dto.depositConfirmed = booking.deposit_confirmed_at != null;
  dto.depositRequiredCents = calculateDepositCents(dto.invoiceTotalCents);

  return jsonResponse({
    ...dto,
    bookingStatus: booking.status,
    stripeCustomerId: booking.stripe_customer_id,
    stripeInvoiceId: booking.stripe_invoice_id,
    depositPaymentIntentId: booking.stripe_deposit_payment_intent_id,
    finalPaymentIntentId: booking.stripe_final_payment_intent_id,
    depositConfirmedAt: booking.deposit_confirmed_at,
    financiallyCompletedAt: booking.financially_completed_at,
  });
}

// ── resend_final_link ──────────────────────────────────────────────────────
// Revokes the existing payment_access_token, issues a new one, and resends
// the customer email with the new /invoice/:token/final link.

async function handleResendFinalLink(supabase, bookingId, admin) {
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select(
      'id, business_id, status, customer_email, customer_name, ' +
      'stripe_invoice_id, stripe_final_payment_intent_id, financially_completed_at'
    )
    .eq('id', bookingId)
    .single();

  if (bookingErr || !booking) return errorResponse('Booking not found', 404);

  if (booking.financially_completed_at) {
    return errorResponse('Final payment is already complete', 409);
  }

  if (!booking.stripe_final_payment_intent_id) {
    return errorResponse(
      'No final payment has been requested for this booking. ' +
      'Complete the job first via complete-job.',
      400
    );
  }

  if (!booking.customer_email) {
    return errorResponse('No customer email on file', 400);
  }

  // Revoke all existing unexpired final_payment tokens for this booking
  await supabase
    .from('payment_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .eq('purpose', 'final_payment')
    .is('revoked_at', null);

  // Generate new token
  const rawToken = generateToken();
  const tokenHash = await sha256(rawToken);
  const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: insertErr } = await supabase.from('payment_access_tokens').insert({
    booking_id: bookingId,
    business_id: booking.business_id,
    token_hash: tokenHash,
    purpose: 'final_payment',
    expires_at: tokenExpiry,
  });

  if (insertErr) {
    console.error('Failed to insert new payment_access_token:', insertErr);
    return errorResponse('Failed to generate new payment link', 500);
  }

  // Load remaining amount from Stripe
  let amountRemainingCents = null;
  try {
    const stripe = getStripeClient();
    const invoice = await stripe.invoices.retrieve(booking.stripe_invoice_id);
    amountRemainingCents = invoice.amount_remaining;
  } catch (stripeErr) {
    console.error('Failed to load invoice for resend:', stripeErr.message, { bookingId });
    // Non-fatal — still send the email without the amount
  }

  // Send email
  const emailSent = await sendFinalPaymentEmail(
    booking, rawToken, amountRemainingCents
  );

  await supabase.from('audit_log').insert({
    booking_id: bookingId,
    business_id: booking.business_id,
    event_type: 'final_payment_requested',
    admin_id: admin.id,
    metadata: {
      action: 'resend_final_link',
      email_sent: emailSent,
      amount_remaining_cents: amountRemainingCents,
    },
  });

  return jsonResponse({ success: true, emailSent, amountRemainingCents });
}

// ── reconcile ──────────────────────────────────────────────────────────────
// Delegates to reconcile-stripe logic inline (avoids internal HTTP call).

async function handleReconcile(supabase, bookingId, admin, req) {
  // Forward to the reconcile endpoint by reusing the same module logic.
  // We replicate the core logic here to avoid an internal fetch.
  const { getStripeClient: getStripe, calculateDepositCents: calcDeposit } =
    await import('./_shared/stripe.js');

  const stripe = getStripe();
  const mismatches = [];
  const actions = [];

  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select(
      'id, business_id, status, stripe_invoice_id, stripe_customer_id, ' +
      'stripe_deposit_payment_intent_id, deposit_confirmed_at, financially_completed_at'
    )
    .eq('id', bookingId)
    .single();

  if (bookingErr || !booking) return errorResponse('Booking not found', 404);

  if (!booking.stripe_invoice_id) {
    mismatches.push({ field: 'stripe_invoice_id', issue: 'No invoice linked' });
    return jsonResponse({ mismatches, actions });
  }

  let invoice;
  try {
    invoice = await stripe.invoices.retrieve(booking.stripe_invoice_id);
  } catch (e) {
    return errorResponse(`Failed to load Stripe invoice: ${e.message}`, 502);
  }

  if (invoice.metadata?.booking_id !== bookingId) {
    mismatches.push({
      field: 'invoice.metadata.booking_id',
      issue: 'Mismatch — cannot reconcile safely',
      expected: bookingId,
      got: invoice.metadata?.booking_id,
    });
    return jsonResponse({ mismatches, actions });
  }

  const requiredDepositCents = calcDeposit(invoice.amount_due);

  if (!booking.deposit_confirmed_at && invoice.amount_paid >= requiredDepositCents) {
    mismatches.push({
      field: 'deposit_confirmed_at',
      issue: 'Stripe shows deposit paid but DB not updated',
    });

    await supabase.rpc('confirm_deposit_atomic', {
      p_booking_id: bookingId,
      p_deposit_payment_intent_id: booking.stripe_deposit_payment_intent_id,
      p_invoice_payment_id: null,
      p_token_hash: null,
    });

    await supabase.from('audit_log').insert({
      booking_id: bookingId,
      business_id: booking.business_id,
      event_type: 'stripe_reconciled',
      admin_id: admin.id,
      metadata: { action: 'confirmed_deposit', via: 'admin_payment_action' },
    });

    actions.push('Confirmed deposit, moved booking to scheduled');
  }

  if (!booking.financially_completed_at && invoice.amount_remaining === 0) {
    mismatches.push({
      field: 'financially_completed_at',
      issue: 'Invoice fully paid in Stripe but not marked in DB',
    });

    await supabase
      .from('bookings')
      .update({ financially_completed_at: new Date().toISOString() })
      .eq('id', bookingId);

    await supabase.from('audit_log').insert({
      booking_id: bookingId,
      business_id: booking.business_id,
      event_type: 'stripe_reconciled',
      admin_id: admin.id,
      metadata: { action: 'set_financially_completed_at', via: 'admin_payment_action' },
    });

    actions.push('Set financially_completed_at');
  }

  return jsonResponse({ mismatches, actions });
}

// ── generate_customer_link ─────────────────────────────────────────────────
// Issues a new payment_access_token and returns the customer URL without
// sending an email. Used by admins to copy the link to clipboard.

async function handleGenerateCustomerLink(supabase, bookingId, admin) {
  const { data: booking, error: bookingErr } = await supabase
    .from('bookings')
    .select('id, business_id, stripe_final_payment_intent_id, financially_completed_at')
    .eq('id', bookingId)
    .single();

  if (bookingErr || !booking) return errorResponse('Booking not found', 404);

  if (!booking.stripe_final_payment_intent_id) {
    return errorResponse(
      'No final payment has been requested yet. Complete the job first.',
      400
    );
  }

  // Revoke existing tokens
  await supabase
    .from('payment_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('booking_id', bookingId)
    .eq('purpose', 'final_payment')
    .is('revoked_at', null);

  const rawToken = generateToken();
  const tokenHash = await sha256(rawToken);
  const tokenExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: insertErr } = await supabase.from('payment_access_tokens').insert({
    booking_id: bookingId,
    business_id: booking.business_id,
    token_hash: tokenHash,
    purpose: 'final_payment',
    expires_at: tokenExpiry,
  });

  if (insertErr) {
    console.error('Failed to insert payment_access_token:', insertErr);
    return errorResponse('Failed to generate customer link', 500);
  }

  await supabase.from('audit_log').insert({
    booking_id: bookingId,
    business_id: booking.business_id,
    event_type: 'token_revoked',
    admin_id: admin.id,
    metadata: { action: 'generate_customer_link' },
  });

  const baseUrl = process.env.URL || 'https://squatterz.com';
  return jsonResponse({ customerUrl: `${baseUrl}/invoice/${rawToken}/final` });
}

// ── Email helper ───────────────────────────────────────────────────────────

async function sendFinalPaymentEmail(booking, rawToken, amountRemainingCents) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey || !booking.customer_email) return false;

  const baseUrl = process.env.URL || 'https://squatterz.com';
  const finalPageUrl = `${baseUrl}/invoice/${rawToken}/final`;
  const firstName = booking.customer_name?.split(' ')[0] || 'there';
  const amountStr = amountRemainingCents != null
    ? ` of <strong>$${(amountRemainingCents / 100).toFixed(2)}</strong>`
    : '';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'noreply@squatterz.com',
        to: booking.customer_email,
        subject: 'Your final payment link: view job report and pay balance',
        html: `<p>Hi ${firstName},</p>
<p>Here is your updated link to view your job completion report and pay the remaining balance${amountStr}.</p>
<p><a href="${finalPageUrl}" style="background:#22c55e;color:#000;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:bold;display:inline-block;">View Job Report &amp; Pay Balance</a></p>
<p>This link is secure and expires in 7 days.</p>
<p>Thank you for choosing Squatterz!</p>`,
      }),
    });
    return res.ok;
  } catch (e) {
    console.error('Failed to send final payment resend email:', e.message);
    return false;
  }
}

export const config = { path: '/api/admin-payment-action' };
