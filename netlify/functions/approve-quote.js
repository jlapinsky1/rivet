import {
  getServiceClient, verifyAdmin, verifyBusinessMember, generateToken, sha256,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';
import {
  getStripeClient, getOrCreateStripeCustomer, toCents, ikey,
} from './_shared/stripe.js';

/**
 * Sends the customer their quote link via Resend.
 * Fire-and-forget — email failure never blocks the approval response.
 */
async function sendQuoteEmail({ customerName, customerEmail, fullAddress, approvedPrice, quoteUrl }) {
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@squatterz.com';
  if (!resendKey || !customerEmail) return;

  const firstName = customerName ? customerName.split(' ')[0] : 'there';
  const priceFormatted = `$${Number(approvedPrice).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Squatterz <${fromEmail}>`,
      to: [customerEmail],
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
          <p style="color:#fff;font-size:14px;font-weight:600;margin:0 0 24px;">${fullAddress}</p>
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
            This quote expires in 7 days.<br>
            Questions? Call us at (813) 555-0123.
          </p>
        </div>
      `,
    }),
  }).catch(err => console.error('Quote email failed (non-fatal):', err.message));
}

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    // Try new business membership auth first, fall back to legacy admin auth
    const bizAuth = await verifyBusinessMember(req);
    const admin = bizAuth?.user || await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const {
      bookingId,
      approvedPrice,
      recommendedPrice,
      estimateSnapshot,
      settingsSnapshot,
      availableSlots,
      expiresAt,
      customerTerms,
      adminOverride,
      decisionContext,
    } = await req.json();

    if (!bookingId || approvedPrice == null || !estimateSnapshot || !customerTerms) {
      return errorResponse('Missing required fields');
    }

    // Validate price is a positive number before any Stripe work
    const approvedPriceCents = toCents(approvedPrice);
    if (!Number.isInteger(approvedPriceCents) || approvedPriceCents <= 0) {
      return errorResponse('approvedPrice must be a positive amount');
    }

    const supabase = getServiceClient();

    // Generate token: raw goes to customer URL, hash stored in DB
    const rawToken = generateToken();
    const tokenHash = await sha256(rawToken);

    const { data, error } = await supabase.rpc('approve_quote_atomic', {
      p_booking_id: bookingId,
      p_admin_id: admin.id,
      p_approved_price: approvedPrice,
      p_recommended_price: recommendedPrice || approvedPrice,
      p_estimate_snapshot: estimateSnapshot,
      p_settings_snapshot: settingsSnapshot || {},
      p_available_slots: availableSlots || [],
      p_expires_at: expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      p_customer_terms: customerTerms,
      p_admin_override: adminOverride || null,
      p_token_hash: tokenHash,
      p_decision_context: decisionContext || null,
    });

    if (error) {
      console.error('approve_quote_atomic error:', error);
      return errorResponse(error.message || 'Approval failed', 500);
    }

    const quoteVersion = data.version;

    // ── Load booking (needed for Stripe + customer email) ───────────────────

    const { data: booking, error: bookingErr } = await supabase
      .from('bookings')
      .select(
        'id, business_id, customer_name, customer_email, full_address, ' +
        'stripe_customer_id, stripe_invoice_id, deposit_confirmed_at'
      )
      .eq('id', bookingId)
      .single();

    if (bookingErr || !booking) {
      return errorResponse('Booking not found after approval', 500);
    }

    // ── Stripe: create or reuse customer + invoice ──────────────────────────

    let stripeError = null;
    try {
      const stripe = getStripeClient();

      // If a new version but deposit already paid, block invoice replacement
      if (quoteVersion > 1 && booking.deposit_confirmed_at) {
        return errorResponse(
          'Cannot revise a quote after deposit has been collected. ' +
          'Use the adjustment workflow.',
          409
        );
      }

      // If re-approving an existing quote version, reuse the invoice (idempotent)
      if (booking.stripe_invoice_id && quoteVersion === (data.version)) {
        // Check if this invoice belongs to this booking via metadata
        try {
          const existingInvoice = await stripe.invoices.retrieve(booking.stripe_invoice_id);
          if (existingInvoice.metadata?.booking_id === bookingId) {
            // Reuse existing invoice — idempotent re-approval
            return jsonResponse({
              ...data,
              quoteToken: rawToken,
              stripeInvoiceId: booking.stripe_invoice_id,
              stripeCustomerId: booking.stripe_customer_id,
            });
          }
        } catch {
          // Invoice not found in Stripe — proceed to create new one
        }
      }

      // If new version and old invoice exists with no deposit: void old invoice
      if (booking.stripe_invoice_id && quoteVersion > 1 && !booking.deposit_confirmed_at) {
        try {
          await stripe.invoices.voidInvoice(booking.stripe_invoice_id);
          await supabase.from('audit_log').insert({
            booking_id: bookingId,
            business_id: bizAuth?.businessId || booking.business_id,
            event_type: 'invoice_voided',
            admin_id: admin.id,
            metadata: {
              old_invoice_id: booking.stripe_invoice_id,
              new_version: quoteVersion,
            },
          });
        } catch (voidErr) {
          console.error('Failed to void old invoice:', voidErr.message);
          // Non-fatal: continue creating new invoice
        }
      }

      // Get or create Stripe Customer
      let customerId = booking.stripe_customer_id;
      if (!customerId) {
        customerId = await getOrCreateStripeCustomer(stripe, booking);
      }

      // Create Invoice (idempotent via idempotency key)
      const invoice = await stripe.invoices.create(
        {
          customer: customerId,
          collection_method: 'send_invoice',
          days_until_due: 30,
          description: `Junk removal – ${booking.full_address}`,
          metadata: {
            booking_id: bookingId,
            quote_version: String(quoteVersion),
            environment: process.env.NODE_ENV || 'production',
          },
        },
        { idempotencyKey: ikey.invoice(bookingId, quoteVersion) }
      );

      // Add line item (must be before finalize)
      await stripe.invoiceItems.create({
        customer: customerId,
        invoice: invoice.id,
        amount: approvedPriceCents,
        currency: 'usd',
        description: `Residential junk removal service – ${booking.full_address}`,
      });

      // Finalize invoice (status: open, immutable line items)
      await stripe.invoices.finalizeInvoice(invoice.id);

      // Persist Stripe IDs to booking
      // If this save fails, the next request will find the invoice via idempotency key
      await supabase
        .from('bookings')
        .update({
          stripe_customer_id: customerId,
          stripe_invoice_id: invoice.id,
        })
        .eq('id', bookingId);

      const siteUrl = process.env.URL || '';
      const quoteUrl = `${siteUrl}/quote/${rawToken}`;
      sendQuoteEmail({
        customerName: booking.customer_name,
        customerEmail: booking.customer_email,
        fullAddress: booking.full_address,
        approvedPrice,
        quoteUrl,
      });

      return jsonResponse({
        ...data,
        quoteToken: rawToken, // only returned once — admin sends this to customer
        stripeInvoiceId: invoice.id,
        stripeCustomerId: customerId,
      });

    } catch (e) {
      stripeError = e;
      console.error('Stripe setup error (quote approval succeeded):', e.message, {
        bookingId,
        quoteVersion,
      });
    }

    // Quote approval in DB succeeded even if Stripe failed.
    // Still send the customer their quote link.
    const siteUrl = process.env.URL || '';
    const quoteUrl = `${siteUrl}/quote/${rawToken}`;
    sendQuoteEmail({
      customerName: booking.customer_name,
      customerEmail: booking.customer_email,
      fullAddress: booking.full_address,
      approvedPrice,
      quoteUrl,
    });

    return jsonResponse({
      ...data,
      quoteToken: rawToken,
      stripeSetupError: 'Payment infrastructure setup failed. Use Reconcile Stripe Status to retry.',
    });

  } catch (e) {
    console.error('approve-quote error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/approve-quote' };
