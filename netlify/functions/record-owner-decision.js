import {
  getServiceClient, verifyAdmin, verifyBusinessMember,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';

/**
 * Record an owner decision for a work item estimation run.
 * Called by: WorkDetailDrawer (UI), RequestQueue (old admin), rivet-agents (chat agent).
 *
 * This is the write path for the feedback loop:
 *   estimation_runs → owner_decisions → weekly-tuning-report
 *
 * The endpoint is intentionally lenient: if estimationRunId is missing we
 * return success silently so callers don't need to guard against missing runs.
 */
export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const bizAuth = await verifyBusinessMember(req);
    const admin = bizAuth?.user || await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const {
      estimationRunId,
      businessId,
      ownerAction,         // 'approved' | 'approved_adjusted' | 'declined' | 'reviewed_later'
      rivetRecommendation, // 'take' | 'take_at_price' | 'review' | 'pass'
      rivetPrice,
      ownerPrice,          // null for declines
      quotedPrice,         // what was actually sent to the customer
      reasonCode,          // ReasonCode or null
      reasonText,          // free-text note
      decisionSnapshot,    // { dayOfWeek, weekNumber, ... } or null
    } = await req.json();

    if (!ownerAction) return errorResponse('ownerAction is required');

    // If no estimationRunId we can't link to a run - return success silently
    // so callers that pre-date estimation runs don't error
    if (!estimationRunId) {
      return jsonResponse({ recorded: false, reason: 'no_estimation_run' });
    }

    const validActions = ['approved', 'approved_adjusted', 'declined', 'reviewed_later'];
    if (!validActions.includes(ownerAction)) {
      return errorResponse(`Invalid ownerAction: ${ownerAction}`);
    }

    const supabase = getServiceClient();

    // Verify the run belongs to the claimed business
    const { data: run } = await supabase
      .from('estimation_runs')
      .select('id, business_id')
      .eq('id', estimationRunId)
      .single();

    if (!run) return jsonResponse({ recorded: false, reason: 'run_not_found' });

    const effectiveBusinessId = businessId || run.business_id;

    const { error } = await supabase.from('owner_decisions').insert({
      id: crypto.randomUUID(),
      estimation_run_id: estimationRunId,
      business_id: effectiveBusinessId,
      user_id: admin.id,
      rivet_recommendation: rivetRecommendation ?? 'unknown',
      owner_action: ownerAction,
      rivet_price: rivetPrice ?? 0,
      owner_price: ownerPrice ?? null,
      quoted_price: quotedPrice ?? null,
      reason_code: reasonCode ?? null,
      reason_text: reasonText ?? null,
      decision_snapshot: decisionSnapshot ?? {},
      decided_at: new Date().toISOString(),
    });

    if (error) {
      console.error('owner_decisions insert error:', error);
      return errorResponse('Failed to record decision', 500);
    }

    return jsonResponse({ recorded: true });
  } catch (e) {
    console.error('record-owner-decision error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/record-owner-decision' };
