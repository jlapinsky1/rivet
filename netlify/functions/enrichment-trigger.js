/**
 * Enrichment trigger endpoint.
 *
 * Evaluates the trigger policy for a given work item and enqueues enrichment
 * tasks (research, BOM) as needed. Called non-blocking from estimate creation
 * and re-estimate. Also accepts manual POST with business-member or admin auth.
 *
 * Auth:
 *   - Internal pipeline calls: x-internal-token header matching INTERNAL_SERVICE_TOKEN env var.
 *   - Manual/debugging calls: standard business-member JWT auth.
 *
 * POST /api/enrichment-trigger
 * Body: { businessId, workItemId, estimationRunId? }
 */

import { getServiceClient, jsonResponse, errorResponse, verifyBusinessMember, verifyAdmin } from './_shared/supabase.js';
import {
  evaluateTriggers,
  enqueueEnrichmentTasks,
} from './_shared/enrichmentOrchestrator.js';

async function authenticate(req, businessId) {
  // Internal service-to-service calls
  const internalToken = process.env.INTERNAL_SERVICE_TOKEN;
  if (internalToken) {
    const provided = req.headers.get('x-internal-token');
    if (provided === internalToken) return { authorized: true };
  }

  // Manual authenticated calls (admin or business member)
  const admin = await verifyAdmin(req);
  if (admin) return { authorized: true };

  const member = await verifyBusinessMember(req, { businessId });
  if (member) return { authorized: true };

  return { authorized: false };
}

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  let body;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON', 400);
  }

  const { businessId, workItemId, estimationRunId } = body;
  if (!businessId || !workItemId) {
    return errorResponse('businessId and workItemId required', 400);
  }

  const { authorized } = await authenticate(req, businessId);
  if (!authorized) return errorResponse('Unauthorized', 401);

  const supabase = getServiceClient();

  // Fetch work item — include estimation_run_id for extraction fallback
  const { data: item, error: itemErr } = await supabase
    .from('work_items')
    .select('enrichment_status, research_brief_meta, materials_bom_meta, materials_bom, extraction_result, estimation_run_id')
    .eq('id', workItemId)
    .eq('business_id', businessId)
    .single();

  if (itemErr || !item) return errorResponse('Work item not found', 404);

  // P0-1: resolve extraction — work_items first, then estimation_runs fallback
  let extraction = item.extraction_result;
  if (!extraction) {
    const runId = estimationRunId ?? item.estimation_run_id;
    if (runId) {
      const { data: run } = await supabase
        .from('estimation_runs')
        .select('extraction')
        .eq('id', runId)
        .single();
      extraction = run?.extraction ?? null;
    }
  }

  if (!extraction) {
    return jsonResponse({ enqueued: false, reason: 'No extraction result yet' });
  }

  const { shouldResearch, shouldBom, fingerprint } = evaluateTriggers(extraction, item);

  if (!shouldResearch && !shouldBom) {
    return jsonResponse({ enqueued: false, reason: 'No enrichment needed', fingerprint });
  }

  try {
    const enqueued = await enqueueEnrichmentTasks(supabase, {
      businessId,
      workItemId,
      estimationRunId: estimationRunId ?? item.estimation_run_id ?? null,
      shouldResearch,
      shouldBom,
      fingerprint,
    });

    return jsonResponse({ enqueued: enqueued.length > 0, tasks: enqueued, fingerprint });
  } catch (err) {
    console.error('enrichment-trigger error:', err.message);
    return errorResponse('Failed to enqueue enrichment tasks', 500);
  }
}

export const config = { path: '/api/enrichment-trigger' };
