import { jsonResponse, errorResponse } from './_shared/supabase.js';
import { processBooking } from './_shared/processBooking.js';

const AGENTS_URL = process.env.AGENTS_URL ?? 'https://rivet-agents.onrender.com';

export default async function handler(req: Request) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { bookingId, businessId } = await req.json();
    if (!bookingId || !businessId) return errorResponse('bookingId and businessId required');

    const result = await processBooking(bookingId, businessId);

    if (!result.alreadyProcessed && result.workItemId) {
      // Fire scope analysis for new review jobs — non-blocking
      if (result.recommendation === 'review') {
        fetch(`${AGENTS_URL}/agent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: 'refresh-scope',
            businessId,
            workItemId: result.workItemId,
          }),
        }).catch(err => console.error('[agents] scope analysis failed:', err));
      }

      // Fire enrichment trigger for all new estimate runs — non-blocking
      fetch(`${new URL(req.url).origin}/api/enrichment-trigger`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.INTERNAL_SERVICE_TOKEN ? { 'x-internal-token': process.env.INTERNAL_SERVICE_TOKEN } : {}),
        },
        body: JSON.stringify({
          businessId,
          workItemId: result.workItemId,
          estimationRunId: result.estimationRunId,
        }),
      }).catch(err => console.error('[enrichment] trigger failed:', err));
    }

    return jsonResponse(result, (result as { alreadyProcessed?: boolean }).alreadyProcessed ? 200 : 201);
  } catch (err) {
    console.error('process-handyman-booking error:', err);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/process-handyman-booking' };
