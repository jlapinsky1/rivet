import {
  getServiceClient, verifyAdmin,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';
import { sendDeclineEmail } from './_shared/declineEmail.js';

const DECLINABLE_STATUSES = ['pending_review', 'quote_sent', 'awaiting_payment'];

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const admin = await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const { jobId, reason } = await req.json();
    if (!jobId) return errorResponse('jobId is required');

    const supabase = getServiceClient();

    const { data: job, error: loadErr } = await supabase
      .from('jobs')
      .select(`
        id, status, unit, description,
        properties!inner(
          name, address,
          commercial_clients!inner(id, business_id, contact_name, company_name, user_id)
        )
      `)
      .eq('id', jobId)
      .single();

    if (loadErr || !job) return errorResponse('Job not found', 404);

    if (job.status === 'cancelled') {
      return jsonResponse({ success: true, alreadyDeclined: true });
    }

    if (!DECLINABLE_STATUSES.includes(job.status)) {
      return errorResponse(`Cannot decline a job with status "${job.status}"`, 400);
    }

    const client = job.properties.commercial_clients;
    let clientEmail = null;
    try {
      const { data: { user } } = await supabase.auth.admin.getUserById(client.user_id);
      clientEmail = user?.email || null;
    } catch (e) {
      console.error('decline-commercial-job: failed to fetch client email:', e.message);
    }

    const { error: updateErr } = await supabase
      .from('jobs')
      .update({
        status: 'cancelled',
        quote_token_hash: null,
      })
      .eq('id', jobId);

    if (updateErr) {
      console.error('decline-commercial-job update error:', updateErr);
      return errorResponse('Failed to decline job', 500);
    }

    const propertyLabel = [
      job.properties.name,
      job.unit ? `Unit ${job.unit}` : null,
    ].filter(Boolean).join(' — ');

    const emailResult = await sendDeclineEmail({
      to: clientEmail,
      firstName: client.contact_name?.split(' ')[0],
      contextLine: propertyLabel || job.properties.address,
      brand: 'commercial',
      customMessage: reason || undefined,
      subject: 'Update on your commercial service request',
    });

    await supabase.from('audit_log').insert({
      booking_id: null,
      business_id: client.business_id,
      event_type: 'booking_declined',
      admin_id: admin.id,
      reason: reason || null,
      metadata: {
        job_id: jobId,
        client_id: client.id,
        previous_status: job.status,
        email_sent: emailResult.sent,
        email_error: emailResult.reason || null,
      },
    });

    return jsonResponse({
      success: true,
      emailSent: emailResult.sent,
      emailError: emailResult.reason || null,
    });
  } catch (e) {
    console.error('decline-commercial-job error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/decline-commercial-job' };
