import {
  getServiceClient, verifyAdmin,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';
import { getStripeClient } from './_shared/stripe.js';

async function sendCompletionEmail({
  email, contactName, companyName, propertyName, unit,
  completionNotes, itemsRemoved, photos, estimate, hostedInvoiceUrl, siteUrl,
}) {
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@squatterz.com';
  if (!resendKey || !email) return;

  const firstName = contactName ? contactName.split(' ')[0] : 'there';
  const beforePhotos = photos.filter(p => p.kind === 'before');
  const afterPhotos = photos.filter(p => p.kind === 'after');

  const photoRow = (label, list) => list.length === 0 ? '' : `
    <div style="margin-top:16px;">
      <p style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px;">${label}</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        ${list.map(p => `<a href="${p.url}" target="_blank" style="display:block;width:120px;height:90px;overflow:hidden;border-radius:8px;border:1px solid #222;">
          <img src="${p.url}" alt="${label}" style="width:100%;height:100%;object-fit:cover;" />
        </a>`).join('')}
      </div>
    </div>
  `;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `Squatterz <${fromEmail}>`,
      to: [email],
      subject: `Job complete - ${propertyName}${unit ? ` Unit ${unit}` : ''}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#0a0f0d;color:#fff;border-radius:12px;">
          <div style="text-align:center;margin-bottom:24px;">
            <span style="font-size:20px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;">SQUATTERZ</span>
            <div style="color:#22c55e;font-size:10px;letter-spacing:0.2em;font-weight:600;text-transform:uppercase;margin-top:4px;">Commercial Services</div>
          </div>
          <h1 style="font-size:20px;font-weight:900;margin:0 0 8px;text-align:center;">Job Complete!</h1>
          <p style="color:rgba(255,255,255,0.55);font-size:14px;line-height:1.6;margin:0 0 20px;text-align:center;">
            Hi ${firstName}, the work at <strong style="color:#fff;">${propertyName}</strong>${unit ? ` Unit ${unit}` : ''} is done.
          </p>

          <div style="background:#111;border:1px solid #222;border-radius:10px;padding:16px 20px;margin-bottom:20px;">
            ${itemsRemoved ? `
              <p style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px;">Items removed</p>
              <p style="color:#fff;font-size:14px;line-height:1.5;margin:0 0 14px;">${itemsRemoved}</p>
            ` : ''}
            ${completionNotes ? `
              <p style="color:rgba(255,255,255,0.4);font-size:11px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px;">Notes</p>
              <p style="color:rgba(255,255,255,0.8);font-size:14px;line-height:1.5;margin:0;">${completionNotes}</p>
            ` : ''}
          </div>

          ${photoRow('Before', beforePhotos)}
          ${photoRow('After', afterPhotos)}

          ${hostedInvoiceUrl ? `
            <div style="background:#111;border:1px solid #22c55e33;border-radius:10px;padding:16px 20px;margin-top:20px;text-align:center;">
              <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0 0 4px;">Remaining balance due</p>
              <p style="color:#22c55e;font-size:22px;font-weight:900;margin:0 0 12px;">$${(Number(estimate) / 2).toFixed(2)}</p>
              <a href="${hostedInvoiceUrl}" style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:14px;padding:12px 28px;border-radius:8px;text-decoration:none;">
                Pay Balance
              </a>
            </div>
          ` : ''}

          <p style="color:rgba(255,255,255,0.3);font-size:12px;line-height:1.5;text-align:center;margin-top:20px;">
            Full completion details are in your <a href="${siteUrl}/portal" style="color:#22c55e;">client portal</a>.
          </p>
        </div>
      `,
    }),
  }).catch(e => console.error('Completion email failed:', e.message));
}

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const admin = await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const { jobId, completionNotes, itemsRemoved, finalAmount, beforePhotoPaths, afterPhotoPaths } = await req.json();
    if (!jobId) return errorResponse('jobId is required');

    const supabase = getServiceClient();

    // Load job + property + client
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select(`
        id, status, unit, estimate, stripe_invoice_id,
        properties!inner(name, address,
          commercial_clients!inner(company_name, contact_name, user_id)
        ),
        job_photos(id, kind, storage_path)
      `)
      .eq('id', jobId)
      .single();

    if (jobErr || !job) return errorResponse('Job not found', 404);
    if (!['scheduled', 'in_progress'].includes(job.status)) {
      return errorResponse('Job must be scheduled or in_progress to complete', 409);
    }

    // Update job status
    const { error: updateErr } = await supabase
      .from('jobs')
      .update({
        status: 'completed',
        completion_notes: completionNotes || null,
        items_removed: itemsRemoved || null,
        final_amount: finalAmount || job.estimate,
        completed_at: new Date().toISOString(),
      })
      .eq('id', jobId);

    if (updateErr) {
      console.error('complete-commercial-job update error:', updateErr);
      return errorResponse('Failed to complete job', 500);
    }

    // Insert before/after photo records from admin upload
    const newPhotos = [
      ...(Array.isArray(beforePhotoPaths) ? beforePhotoPaths : []).map(p => ({ job_id: jobId, kind: 'before', storage_path: p })),
      ...(Array.isArray(afterPhotoPaths) ? afterPhotoPaths : []).map(p => ({ job_id: jobId, kind: 'after', storage_path: p })),
    ];
    if (newPhotos.length > 0) {
      const { error: photoErr } = await supabase.from('job_photos').insert(newPhotos);
      if (photoErr) console.error('Photo insert error:', photoErr);
    }

    // Get client email
    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(
      job.properties.commercial_clients.user_id
    );
    const clientEmail = authUser?.email;

    // Build photo URLs
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const photos = (job.job_photos || [])
      .filter(p => p.kind === 'before' || p.kind === 'after')
      .map(p => ({
        kind: p.kind,
        url: `${supabaseUrl}/storage/v1/object/public/job-photos/${p.storage_path}`,
      }));

    // Get Stripe hosted invoice URL for final payment
    let hostedInvoiceUrl = null;
    if (job.stripe_invoice_id) {
      try {
        const stripe = getStripeClient();
        const invoice = await stripe.invoices.retrieve(job.stripe_invoice_id);
        if (invoice.amount_remaining > 0) {
          hostedInvoiceUrl = invoice.hosted_invoice_url;
        }
      } catch (e) {
        console.error('Failed to retrieve invoice for completion email:', e.message);
      }
    }

    await sendCompletionEmail({
      email: clientEmail,
      contactName: job.properties.commercial_clients.contact_name,
      companyName: job.properties.commercial_clients.company_name,
      propertyName: job.properties.name,
      unit: job.unit,
      completionNotes,
      itemsRemoved,
      photos,
      estimate: job.estimate,
      hostedInvoiceUrl,
      siteUrl: process.env.URL || '',
    });

    return jsonResponse({ success: true });
  } catch (e) {
    console.error('complete-commercial-job error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/complete-commercial-job' };
