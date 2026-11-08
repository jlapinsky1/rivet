import { jsonResponse, errorResponse } from './_shared/supabase.js';
import { processBooking } from './_shared/processBooking.js';
import { runScopeAnalysis } from './_shared/agent/runScopeAnalysis';

export default async function handler(req: Request) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { bookingId, businessId } = await req.json();
    if (!bookingId || !businessId) return errorResponse('bookingId and businessId required');

    const result = await processBooking(bookingId, businessId);

    // Run agent for new review jobs — writes scope_analysis to work_items
    if (!result.alreadyProcessed && result.recommendation === 'review' && result.workItemId) {
      await runScopeAnalysis(result.workItemId, businessId);
    }

    return jsonResponse(result, (result as { alreadyProcessed?: boolean }).alreadyProcessed ? 200 : 201);
  } catch (err) {
    console.error('process-handyman-booking error:', err);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/process-handyman-booking' };
