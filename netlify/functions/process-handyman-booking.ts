import { jsonResponse, errorResponse } from './_shared/supabase.js';
import { processBooking } from './_shared/processBooking.js';

const AGENTS_URL = process.env.AGENTS_URL ?? 'https://rivet-agents.onrender.com';

export default async function handler(req: Request) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { bookingId, businessId } = await req.json();
    if (!bookingId || !businessId) return errorResponse('bookingId and businessId required');

    const result = await processBooking(bookingId, businessId);

    // Fire scope analysis for new review jobs — non-blocking, don't fail the booking
    if (!result.alreadyProcessed && result.recommendation === 'review' && result.workItemId) {
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

    return jsonResponse(result, (result as { alreadyProcessed?: boolean }).alreadyProcessed ? 200 : 201);
  } catch (err) {
    console.error('process-handyman-booking error:', err);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/process-handyman-booking' };
