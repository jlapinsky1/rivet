import {
  getServiceClient, sha256, verifyCommercialClient,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { token, jobId } = await req.json();
    const supabase = getServiceClient();

    let job;

    if (token) {
      // Email-link flow: look up job by token
      const tokenHash = await sha256(token);
      const { data, error } = await supabase
        .from('jobs')
        .select('id, status, quote_expires_at')
        .eq('quote_token_hash', tokenHash)
        .single();

      if (error || !data) return errorResponse('Quote not found', 404);
      job = data;
    } else {
      // Portal flow: verify client owns the job
      const clientAuth = await verifyCommercialClient(req);
      if (!clientAuth) return errorResponse('Unauthorized', 401);
      const { client } = clientAuth;

      if (!jobId) return errorResponse('jobId or token is required');

      const { data, error } = await supabase
        .from('jobs')
        .select(`
          id, status, quote_expires_at,
          properties!inner(client_id)
        `)
        .eq('id', jobId)
        .single();

      if (error || !data) return errorResponse('Job not found', 404);
      if (data.properties.client_id !== client.id) return errorResponse('Unauthorized', 403);
      job = data;
    }

    if (job.status !== 'quote_sent') {
      if (['awaiting_payment', 'scheduled', 'in_progress', 'completed'].includes(job.status)) {
        // Already accepted - idempotent
        return jsonResponse({ jobId: job.id, alreadyAccepted: true });
      }
      return errorResponse('This quote cannot be accepted in its current state', 409);
    }

    if (job.quote_expires_at && new Date(job.quote_expires_at) < new Date()) {
      return errorResponse('This quote has expired', 410);
    }

    const { error: updateErr } = await supabase
      .from('jobs')
      .update({ status: 'awaiting_payment' })
      .eq('id', job.id)
      .eq('status', 'quote_sent'); // guard against race condition

    if (updateErr) {
      console.error('accept-commercial-quote update error:', updateErr);
      return errorResponse('Failed to accept quote', 500);
    }

    return jsonResponse({ jobId: job.id, accepted: true });
  } catch (e) {
    console.error('accept-commercial-quote error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/accept-commercial-quote' };
