/**
 * Enrichment status endpoint.
 *
 * Returns per-stage enrichment status and metadata for a work item.
 * Used by the UI to render status chips and optionally trigger manual retry.
 *
 * GET /api/enrichment-status?workItemId=123
 */

import { getServiceClient, jsonResponse, errorResponse, verifyBusinessMember } from './_shared/supabase.js';

export default async function handler(req) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const member = await verifyBusinessMember(req);
  if (!member) return errorResponse('Unauthorized', 401);

  const url = new URL(req.url);
  const workItemId = url.searchParams.get('workItemId');
  if (!workItemId) return errorResponse('workItemId required', 400);

  const supabase = getServiceClient();

  const { data: item, error } = await supabase
    .from('work_items')
    .select('enrichment_status, research_brief_meta, materials_bom_meta, estimate_state, estimate_version, estimate_delta')
    .eq('id', workItemId)
    .eq('business_id', member.businessId)
    .single();

  if (error || !item) return errorResponse('Work item not found', 404);

  // Most recent queue entries per task type for error detail
  const { data: tasks } = await supabase
    .from('enrichment_task_queue')
    .select('task_type, status, attempt_count, last_error, updated_at')
    .eq('work_item_id', workItemId)
    .order('created_at', { ascending: false })
    .limit(9);

  // Latest entry per task type
  const latestByType = {};
  for (const t of (tasks || [])) {
    if (!latestByType[t.task_type]) latestByType[t.task_type] = t;
  }

  return jsonResponse({
    enrichmentStatus: item.enrichment_status ?? {},
    researchBriefMeta: item.research_brief_meta ?? null,
    materialsBomMeta: item.materials_bom_meta ?? null,
    estimateState: item.estimate_state ?? null,
    estimateVersion: item.estimate_version ?? null,
    estimateDelta: item.estimate_delta ?? null,
    queueDetails: latestByType,
  });
}

export const config = { path: '/api/enrichment-status' };
