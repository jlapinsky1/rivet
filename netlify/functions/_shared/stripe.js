import Stripe from 'stripe';

/**
 * Pinned Stripe API version - must support POST /v1/invoices/{id}/attach_payment.
 * Verify with: curl https://api.stripe.com/v1/invoices/in_test/attach_payment \
 *   -H "Stripe-Version: 2025-05-28.basil" -u $STRIPE_SECRET_KEY:
 * Expected: 404 "No such invoice" (endpoint exists).
 * Problem:  "No such endpoint" → stop and report; version not supported on this account.
 */
export const STRIPE_API_VERSION = '2025-05-28.basil';

/**
 * Server-side Stripe client. Secret key must exist only in Netlify env vars.
 * Never expose STRIPE_SECRET_KEY through VITE_ variables.
 */
export function getStripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is required');
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

/**
 * Returns a safe payment summary DTO from Stripe's live invoice data.
 * Never return raw Stripe objects to the client.
 *
 * @param {Stripe} stripe
 * @param {string} invoiceId
 * @param {boolean} includeHostedUrl - only expose hosted invoice URL when final payment requested
 */
export async function getPaymentSummaryDTO(stripe, invoiceId, includeHostedUrl = false) {
  const invoice = await stripe.invoices.retrieve(invoiceId, {
    expand: ['payments'],
  });

  const dto = {
    invoiceTotalCents: invoice.amount_due,
    amountPaidCents: invoice.amount_paid,
    amountRemainingCents: invoice.amount_remaining,
    invoiceStatus: invoice.status,
    depositConfirmed: false, // derived below, not from amount_paid > 0
    invoicePdfUrl: invoice.invoice_pdf,
  };

  // Only expose hosted URL once final payment has been requested
  if (includeHostedUrl && invoice.hosted_invoice_url) {
    dto.hostedInvoiceUrl = invoice.hosted_invoice_url;
  }

  return dto;
}

/**
 * Calculate the required deposit amount in integer cents.
 * Uses Math.floor so odd-cent totals round down for the deposit
 * and the final payment covers the remainder.
 * Example: $501.01 total → deposit $250.50, final $250.51
 */
export function calculateDepositCents(invoiceTotalCents) {
  return Math.floor(invoiceTotalCents / 2);
}

/**
 * Convert a dollar amount (numeric) to integer cents.
 * Uses Math.round to avoid floating-point drift.
 * All Stripe amounts must be integer cents - never use floats.
 */
export function toCents(dollars) {
  return Math.round(Number(dollars) * 100);
}

/**
 * Deterministic idempotency keys - include quote_version to prevent
 * cross-version collisions when quotes are revised and invoices voided/recreated.
 */
export const ikey = {
  customer:  (bookingId)               => `customer-${bookingId}`,
  invoice:   (bookingId, quoteVersion) => `invoice-v${quoteVersion}-${bookingId}`,
  depositPI: (bookingId, quoteVersion) => `deposit-pi-v${quoteVersion}-${bookingId}`,
  finalPI:   (bookingId)               => `final-pi-${bookingId}`,
  // Commercial
  commCustomer: (jobId) => `comm-customer-${jobId}`,
  commInvoice:  (jobId) => `comm-invoice-${jobId}`,
  commDepositPI:(jobId) => `comm-deposit-pi-${jobId}`,
};

/**
 * Get or create a Stripe Customer for a booking.
 * Uses idempotency key to prevent duplicates on retry.
 *
 * @param {Stripe} stripe
 * @param {{ id: string, customer_email: string|null, customer_name: string }} booking
 * @returns {Promise<string>} customerId
 */
/**
 * Get or create a Stripe Customer for a commercial job.
 * @param {Stripe} stripe
 * @param {{ id: string, email: string|null, contactName: string|null, companyName: string|null }} job
 */
export async function getOrCreateCommercialStripeCustomer(stripe, job) {
  const customer = await stripe.customers.create(
    {
      email: job.email || undefined,
      name: job.companyName || job.contactName || undefined,
      metadata: {
        job_id: job.id,
        environment: process.env.NODE_ENV || 'production',
      },
    },
    { idempotencyKey: ikey.commCustomer(job.id) }
  );
  return customer.id;
}

export async function getOrCreateStripeCustomer(stripe, booking) {
  const customer = await stripe.customers.create(
    {
      email: booking.customer_email || undefined,
      name: booking.customer_name || undefined,
      metadata: {
        booking_id: booking.id,
        environment: process.env.NODE_ENV || 'production',
      },
    },
    { idempotencyKey: ikey.customer(booking.id) }
  );
  return customer.id;
}
