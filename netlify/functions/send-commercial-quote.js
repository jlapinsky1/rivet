import {
  getServiceClient, verifyAdmin, generateToken, sha256,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';
import {
  getStripeClient, getOrCreateCommercialStripeCustomer,
  toCents, ikey,
} from './_shared/stripe.js';

async function sendQuoteEmail({ contactName, email, propertyName, unit, estimate, depositAmount, quoteUrl, expiresAt }) {
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@squatterz.com';
  if (!resendKey || !email) return;

  const firstName = contactName ? contactName.split(' ')[0] : 'there';
  const fmt = n => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const expDate = expiresAt ? new Date(expiresAt).toLocaleDateString() : '7 days';

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Squatterz <${fromEmail}>`,
      to: [email],
      subject: `Your estimate is ready - ${propertyName}${unit ? ` Unit ${unit}` : ''}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0f0d;color:#fff;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:20px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;">SQUATTERZ</span>
            <div style="color:#22c55e;font-size:10px;letter-spacing:0.2em;font-weight:600;text-transform:uppercase;margin-top:4px;">Commercial Services</div>
          </div>
          <h1 style="font-size:20px;font-weight:900;margin:0 0 8px;text-align:center;">Your estimate is ready, ${firstName}!</h1>
          <p style="color:rgba(255,255,255,0.55);font-size:14px;line-height:1.6;margin:0 0 8px;text-align:center;">
            For: <strong style="color:#fff;">${propertyName}</strong>${unit ? ` - Unit ${unit}` : ''}
          </p>
          <div style="background:#111;border:1px solid #222;border-radius:10px;padding:20px;margin:24px 0;text-align:center;">
            <div style="color:rgba(255,255,255,0.4);font-size:12px;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em;">Total estimate</div>
            <div style="color:#22c55e;font-size:36px;font-weight:900;">${fmt(estimate)}</div>
            <div style="color:rgba(255,255,255,0.4);font-size:12px;margin-top:12px;padding-top:12px;border-top:1px solid #222;">
              <span>50% deposit to schedule: </span>
              <strong style="color:#fff;">${fmt(depositAmount)}</strong>
            </div>
          </div>
          <p style="color:rgba(255,255,255,0.55);font-size:14px;line-height:1.6;margin:0 0 24px;text-align:center;">
            Review your estimate and pay the deposit to schedule your service.
            The remaining balance is due after the job is complete.
          </p>
          <div style="text-align:center;margin-bottom:24px;">
            <a href="${quoteUrl}" style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:15px;padding:14px 36px;border-radius:10px;text-decoration:none;">
              Review &amp; Accept Estimate
            </a>
          </div>
          <p style="color:rgba(255,255,255,0.3);font-size:12px;line-height:1.5;text-align:center;">
            This estimate expires ${expDate}. You can also accept it directly in your
            <a href="${process.env.URL || ''}/portal" style="color:#22c55e;">client portal</a>.
          </p>
        </div>
      `,
    }),
  }).catch(e => console.error('Quote email send failed:', e.message));
}

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const admin = await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const { jobId, estimate } = await req.json();
    if (!jobId || estimate == null) return errorResponse('jobId and estimate are required');

    const estimateCents = toCents(estimate);
    if (!Number.isInteger(estimateCents) || estimateCents <= 0) {
      return errorResponse('estimate must be a positive amount');
    }

    const supabase = getServiceClient();

    // Load job + property + client
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select(`
        id, status, unit, description, stripe_invoice_id, stripe_customer_id,
        properties!inner(name, address,
          commercial_clients!inner(company_name, contact_name, user_id)
        )
      `)
      .eq('id', jobId)
      .single();

    if (jobErr || !job) return errorResponse('Job not found', 404);
    if (!['pending_review', 'quote_sent'].includes(job.status)) {
      return errorResponse('Job is not in a quotable status', 409);
    }

    // Get client email
    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(
      job.properties.commercial_clients.user_id
    );
    const clientEmail = authUser?.email;

    const stripe = getStripeClient();

    // Get or create Stripe Customer
    let customerId = job.stripe_customer_id;
    if (!customerId) {
      customerId = await getOrCreateCommercialStripeCustomer(stripe, {
        id: jobId,
        email: clientEmail,
        companyName: job.properties.commercial_clients.company_name,
        contactName: job.properties.commercial_clients.contact_name,
      });
    }

    // If re-quoting, void old invoice (if no deposit paid yet)
    if (job.stripe_invoice_id && job.status === 'quote_sent') {
      try {
        const existingInv = await stripe.invoices.retrieve(job.stripe_invoice_id);
        if (existingInv.status === 'open') {
          await stripe.invoices.voidInvoice(job.stripe_invoice_id);
        }
      } catch (e) {
        console.error('Failed to void old invoice:', e.message);
      }
    }

    // Create new Stripe Invoice
    const invoice = await stripe.invoices.create(
      {
        customer: customerId,
        collection_method: 'send_invoice',
        days_until_due: 30,
        description: `Commercial junk removal - ${job.properties.name}${job.unit ? ` Unit ${job.unit}` : ''}`,
        metadata: {
          job_id: jobId,
          environment: process.env.NODE_ENV || 'production',
        },
      },
      { idempotencyKey: ikey.commInvoice(jobId) }
    );

    await stripe.invoiceItems.create({
      customer: customerId,
      invoice: invoice.id,
      amount: estimateCents,
      currency: 'usd',
      description: `Commercial junk removal - ${job.properties.name}${job.unit ? ` Unit ${job.unit}` : ''} (${job.properties.address})`,
    });

    await stripe.invoices.finalizeInvoice(invoice.id);

    // Generate quote token
    const rawToken = generateToken();
    const tokenHash = await sha256(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    // Update job
    await supabase.from('jobs').update({
      status: 'quote_sent',
      estimate,
      stripe_customer_id: customerId,
      stripe_invoice_id: invoice.id,
      quote_token_hash: tokenHash,
      quote_expires_at: expiresAt,
      quote_sent_at: new Date().toISOString(),
      quoted_at: new Date().toISOString(),
    }).eq('id', jobId);

    const siteUrl = process.env.URL || '';
    const quoteUrl = `${siteUrl}/commercial/quote/${rawToken}`;
    const depositAmount = Number(estimate) / 2;

    await sendQuoteEmail({
      contactName: job.properties.commercial_clients.contact_name,
      email: clientEmail,
      propertyName: job.properties.name,
      unit: job.unit,
      estimate,
      depositAmount,
      quoteUrl,
      expiresAt,
    });

    return jsonResponse({ success: true, quoteToken: rawToken });
  } catch (e) {
    console.error('send-commercial-quote error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/send-commercial-quote' };
