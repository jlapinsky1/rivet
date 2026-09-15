import {
  getServiceClient,
  verifyCommercialClient,
  jsonResponse,
  errorResponse,
} from './_shared/supabase.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const clientAuth = await verifyCommercialClient(req);
    if (!clientAuth) return errorResponse('Unauthorized', 401);
    const { user, client } = clientAuth;

    const { propertyId, jobId } = await req.json();
    if (!propertyId || !jobId) return errorResponse('propertyId and jobId are required.');

    const supabase = getServiceClient();

    // Verify propertyId belongs to this client
    const { data: property } = await supabase
      .from('properties')
      .select('id, name, address')
      .eq('id', propertyId)
      .eq('client_id', client.id)
      .single();

    if (!property) return errorResponse('Property not found or access denied.', 404);

    // Verify jobId belongs to this property and is still a draft
    const { data: job } = await supabase
      .from('jobs')
      .select('id, description, status, unit')
      .eq('id', jobId)
      .eq('property_id', propertyId)
      .single();

    if (!job) return errorResponse('Job not found or access denied.', 404);

    if (job.status !== 'draft') {
      // Already submitted - idempotent success so a double-submit does no harm
      return jsonResponse({ success: true, alreadySubmitted: true }, 200);
    }

    if (!job.description || !job.description.trim()) {
      return errorResponse('Job description is required before submitting.', 422);
    }

    // Transition draft → pending_review
    const { error: updateJobErr } = await supabase
      .from('jobs')
      .update({ status: 'pending_review' })
      .eq('id', jobId)
      .eq('status', 'draft'); // guard against race conditions

    if (updateJobErr) {
      console.error('complete-onboarding: job status update failed');
      return errorResponse('Failed to submit work order.', 500);
    }

    // Mark onboarding complete
    await supabase
      .from('commercial_clients')
      .update({ onboarding_status: 'complete' })
      .eq('user_id', user.id);

    // Send emails
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.RESEND_FROM_EMAIL || 'noreply@gosquatterz.com';
    const adminEmail = process.env.ADMIN_EMAIL;
    const siteUrl = process.env.URL || 'https://gosquatterz.com';

    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(user.id);
    const clientEmail = authUser?.email;

    const shortId = `#${job.id.slice(0, 8).toUpperCase()}`;
    const firstName = client.contact_name ? client.contact_name.split(' ')[0] : 'there';

    if (resendKey) {
      const emailPromises = [];

      // Customer confirmation
      if (clientEmail) {
        emailPromises.push(
          fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: `Squatterz <${fromEmail}>`,
              to: [clientEmail],
              subject: `Work order submitted - ${shortId}`,
              html: `
                <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0a0f0d;color:#fff;border-radius:12px;">
                  <div style="text-align:center;margin-bottom:24px;">
                    <span style="font-size:20px;font-weight:900;letter-spacing:0.15em;text-transform:uppercase;">SQUATTERZ</span>
                    <div style="color:#22c55e;font-size:10px;letter-spacing:0.2em;font-weight:600;text-transform:uppercase;margin-top:4px;">Commercial Services</div>
                  </div>
                  <h1 style="font-size:20px;font-weight:900;margin:0 0 12px;text-align:center;">Request received</h1>
                  <p style="color:rgba(255,255,255,0.55);font-size:14px;line-height:1.6;margin:0 0 24px;text-align:center;">
                    Hi ${firstName},<br><br>
                    Your work order has been submitted for <strong style="color:#fff;">${property.name}</strong>.
                    We'll review it and reach out to confirm scheduling.
                  </p>
                  <div style="background:#111;border:1px solid #222;border-radius:10px;padding:16px 20px;margin-bottom:24px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                      <span style="color:rgba(255,255,255,0.4);font-size:13px;">Reference</span>
                      <span style="color:#22c55e;font-family:monospace;font-weight:700;font-size:13px;">${shortId}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                      <span style="color:rgba(255,255,255,0.4);font-size:13px;">Property</span>
                      <span style="color:#fff;font-size:13px;">${property.name}</span>
                    </div>
                    ${job.unit ? `
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                      <span style="color:rgba(255,255,255,0.4);font-size:13px;">Unit / Location</span>
                      <span style="color:#fff;font-size:13px;">${job.unit}</span>
                    </div>` : ''}
                    <div style="display:flex;justify-content:space-between;">
                      <span style="color:rgba(255,255,255,0.4);font-size:13px;">Status</span>
                      <span style="color:#fff;font-size:13px;font-weight:600;">Under review</span>
                    </div>
                  </div>
                  <div style="text-align:center;margin-bottom:16px;">
                    <a href="${siteUrl}/portal"
                       style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:14px;padding:14px 28px;border-radius:100px;text-decoration:none;">
                      View in Client Portal &rarr;
                    </a>
                  </div>
                  <p style="color:rgba(255,255,255,0.3);font-size:12px;text-align:center;">
                    Questions? Call <a href="tel:7706282877" style="color:#22c55e;">(770) 628-2877</a>
                  </p>
                </div>
              `,
            }),
          }).catch(() => console.error('Client confirmation email failed'))
        );
      }

      // Admin notification - includes job details for immediate action
      if (adminEmail) {
        emailPromises.push(
          fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${resendKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: `Squatterz <${fromEmail}>`,
              to: [adminEmail],
              subject: `New commercial account + work order ${shortId} - ${client.company_name || client.contact_name}`,
              html: `
                <div style="font-family:sans-serif;max-width:520px;padding:24px;">
                  <h2>New Commercial Account + Work Order</h2>
                  <p><strong>Company:</strong> ${client.company_name || 'N/A'}</p>
                  <p><strong>Contact:</strong> ${client.contact_name || 'N/A'}</p>
                  <p><strong>Email:</strong> ${clientEmail || 'N/A'}</p>
                  <p><strong>Phone:</strong> ${client.phone || 'N/A'}</p>
                  <hr>
                  <p><strong>Property:</strong> ${property.name} - ${property.address}</p>
                  <p><strong>Job Reference:</strong> ${shortId}</p>
                  ${job.unit ? `<p><strong>Unit / Location:</strong> ${job.unit}</p>` : ''}
                  ${job.description ? `<p><strong>Description:</strong> ${job.description}</p>` : ''}
                  <p><a href="${siteUrl}/admin/commercial">Review in Admin &rarr;</a></p>
                </div>
              `,
            }),
          }).catch(() => console.error('Admin notification email failed'))
        );
      }

      await Promise.all(emailPromises);
    }

    return jsonResponse({ success: true }, 200);
  } catch (e) {
    console.error('complete-onboarding error');
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/complete-onboarding' };
