import {
  getServiceClient, verifyAdmin, jsonResponse, errorResponse,
} from './_shared/supabase.js';
import { getStripeClient, calculateDepositCents } from './_shared/stripe.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const admin = await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const { bookingId } = await req.json();
    if (!bookingId) return errorResponse('bookingId is required');

    const supabase = getServiceClient();
    const stripe = getStripeClient();

    // ── Load booking ───────────────────────────────────────────────────────
    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select(
        'id, business_id, status, stripe_customer_id, stripe_invoice_id, ' +
        'stripe_deposit_payment_intent_id, stripe_final_payment_intent_id, ' +
        'deposit_confirmed_at, financially_completed_at, approved_quote'
      )
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) return errorResponse('Booking not found', 404);

    const mismatches = [];
    const actions = [];
    let invoiceId = booking.stripe_invoice_id;

    // ── Step 1: Re-link orphaned invoice (Stripe success + DB failure) ────
    if (!invoiceId) {
      try {
        // Search Stripe invoices for this booking_id in metadata
        const invoiceList = await stripe.invoices.list({
          limit: 10,
          expand: ['data.metadata'],
        });

        const orphaned = invoiceList.data.find(
          inv => inv.metadata?.booking_id === bookingId
        );

        if (orphaned) {
          mismatches.push({
            field: 'stripe_invoice_id',
            issue: 'Invoice exists in Stripe but not linked in DB',
            stripeId: orphaned.id,
          });

          await supabase
            .from('bookings')
            .update({
              stripe_invoice_id: orphaned.id,
              stripe_customer_id: booking.stripe_customer_id || orphaned.customer,
            })
            .eq('id', bookingId);

          await supabase.from('audit_log').insert({
            booking_id: bookingId,
            business_id: booking.business_id,
            event_type: 'stripe_reconciled',
            admin_id: admin.id,
            metadata: {
              action: 'relinked_invoice',
              stripe_invoice_id: orphaned.id,
            },
          });

          actions.push(`Re-linked invoice ${orphaned.id} to booking`);
          invoiceId = orphaned.id;
        } else {
          mismatches.push({
            field: 'stripe_invoice_id',
            issue: 'No Stripe invoice found for this booking',
          });
        }
      } catch (stripeErr) {
        console.error('Stripe invoice search failed:', stripeErr.message, { bookingId });
        mismatches.push({
          field: 'stripe_invoice_id',
          issue: `Stripe search error: ${stripeErr.message}`,
        });
      }
    }

    if (!invoiceId) {
      return jsonResponse({ mismatches, actions });
    }

    // ── Step 2: Load authoritative invoice from Stripe ────────────────────
    let invoice;
    try {
      invoice = await stripe.invoices.retrieve(invoiceId, { expand: ['payments'] });
    } catch (stripeErr) {
      console.error('Failed to retrieve invoice:', stripeErr.message, { invoiceId });
      return errorResponse(`Failed to load Stripe invoice: ${stripeErr.message}`, 502);
    }

    // Verify invoice metadata points to this booking
    if (invoice.metadata?.booking_id !== bookingId) {
      mismatches.push({
        field: 'invoice.metadata.booking_id',
        issue: 'Invoice metadata booking_id does not match',
        expected: bookingId,
        got: invoice.metadata?.booking_id,
      });
      // Do not modify anything — mismatch could indicate a data integrity problem
      return jsonResponse({ mismatches, actions });
    }

    const requiredDepositCents = calculateDepositCents(invoice.amount_due);

    // ── Step 3: Check deposit confirmation ────────────────────────────────
    if (!booking.deposit_confirmed_at) {
      const depositPaid = invoice.amount_paid >= requiredDepositCents;

      if (depositPaid) {
        mismatches.push({
          field: 'deposit_confirmed_at',
          issue: 'Stripe shows deposit paid but DB not updated',
          invoiceAmountPaid: invoice.amount_paid,
          requiredDepositCents,
        });

        // Determine which PI was used for the deposit
        const depositPiId = booking.stripe_deposit_payment_intent_id ||
          invoice.payments?.data?.find(
            p => p.amount_paid >= requiredDepositCents
          )?.payment?.payment_intent || null;

        await supabase.rpc('confirm_deposit_atomic', {
          p_booking_id: bookingId,
          p_deposit_payment_intent_id: depositPiId,
          p_invoice_payment_id: null,
          p_token_hash: null,
        });

        await supabase.from('audit_log').insert({
          booking_id: bookingId,
          business_id: booking.business_id,
          event_type: 'stripe_reconciled',
          admin_id: admin.id,
          metadata: {
            action: 'confirmed_deposit',
            invoice_amount_paid: invoice.amount_paid,
            required_deposit_cents: requiredDepositCents,
          },
        });

        actions.push('Set deposit_confirmed_at and moved booking to scheduled');
      }
    }

    // ── Step 4: Check financial completion ────────────────────────────────
    if (!booking.financially_completed_at && invoice.amount_remaining === 0) {
      mismatches.push({
        field: 'financially_completed_at',
        issue: 'Invoice fully paid in Stripe but financially_completed_at not set',
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
        metadata: {
          action: 'set_financially_completed_at',
          invoice_id: invoiceId,
        },
      });

      actions.push('Set financially_completed_at');
    }

    // ── Step 5: Report payment intent mismatches (informational only) ─────
    if (invoice.amount_paid > 0 && invoice.amount_remaining === 0) {
      if (booking.status === 'completed' && !booking.financially_completed_at) {
        mismatches.push({
          field: 'status/financially_completed_at',
          issue: 'Booking is completed but financially_completed_at is unset despite invoice being fully paid',
        });
      }
    }

    return jsonResponse({ mismatches, actions });

  } catch (e) {
    console.error('reconcile-stripe error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/reconcile-stripe' };
