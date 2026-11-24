/**
 * Enrichment queue worker.
 *
 * Runs on a 5-minute cron schedule to drain the enrichment_task_queue.
 * Also POST-accessible with admin auth for on-demand triggering (runbook, backfill).
 *
 * Atomic claiming via claim_enrichment_tasks() uses FOR UPDATE SKIP LOCKED.
 * Processes research, bom, and reestimate task types.
 *
 * Retry policy (same as calibration queue):
 *   attempt 1 → 30s
 *   attempt 2 → 2m
 *   attempt 3 → 10m
 *   attempt 4 → 1h
 *   attempt 5 → dead_letter
 */

import { getServiceClient, verifyAdmin, jsonResponse, errorResponse } from './_shared/supabase.js';
import {
  AGENTS_URL,
  NETLIFY_URL,
  MAX_ATTEMPTS,
  BACKOFF_SECONDS,
  extractionFingerprint,
  validateResearchBrief,
  validateBom,
  updateEnrichmentStages,
  enqueueReestimate,
} from './_shared/enrichmentOrchestrator.js';
import {
  transitionEstimateState,
  expireTimedOutEnrichments,
  enrichmentReasonFlags,
} from './_shared/estimateState.js';

export default async function handler(req) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }
  if (req.method === 'POST') {
    const admin = await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);
  }

  const supabase = getServiceClient();

  // Expire any pending_enrichment jobs whose timeout has passed
  await expireTimedOutEnrichments(supabase);

  const { data: tasks, error: claimErr } = await supabase
    .rpc('claim_enrichment_tasks', { batch_size: 20 });

  if (claimErr) {
    console.error('process-enrichment-queue: failed to claim tasks:', claimErr.message);
    return errorResponse('Failed to claim tasks', 500);
  }

  if (!tasks?.length) {
    return jsonResponse({ processed: 0, message: 'Queue empty' });
  }

  const results = { succeeded: 0, failed: 0, dead_lettered: 0, skipped: 0 };

  for (const task of tasks) {
    try {
      const outcome = await processTask(supabase, task);
      if (outcome === 'skipped') {
        results.skipped++;
        await markSucceeded(supabase, task.task_id, 'skipped_stale_fingerprint');
      } else {
        results.succeeded++;
        await markSucceeded(supabase, task.task_id);
      }
    } catch (err) {
      const attempts = task.attempt_count; // already incremented by claim

      if (attempts >= MAX_ATTEMPTS) {
        await supabase
          .from('enrichment_task_queue')
          .update({ status: 'dead_letter', last_error: err.message, updated_at: new Date().toISOString() })
          .eq('task_id', task.task_id);

        await updateEnrichmentStages(supabase, task.work_item_id, task.business_id, {
          [task.task_type]: { status: 'failed', last_error: err.message, completed_at: new Date().toISOString() },
        });

        // Transition estimate state: reestimate dead-letter = failed_enrichment;
        // research/bom dead-letter = ready_initial_with_warning (can still quote with caveat)
        const deadLetterTargetState = task.task_type === 'reestimate'
          ? 'failed_enrichment'
          : 'ready_initial_with_warning';
        await transitionEstimateState(supabase, task.work_item_id, task.business_id, deadLetterTargetState, {
          triggeredBy: 'dead_letter',
          reason:      `Dead-letter: ${task.task_type} failed after ${attempts} attempts — ${err.message.slice(0, 120)}`,
        });

        console.error('DEAD_LETTER enrichment task — manual intervention required', {
          task_id:        task.task_id,
          work_item_id:   task.work_item_id,
          task_type:      task.task_type,
          target_state:   deadLetterTargetState,
          attempts,
          error:          err.message,
        });

        results.dead_lettered++;
      } else {
        const backoffSecs = BACKOFF_SECONDS[attempts - 1] ?? 14400;
        const nextRetry = new Date(Date.now() + backoffSecs * 1000).toISOString();

        await supabase
          .from('enrichment_task_queue')
          .update({ status: 'failed', last_error: err.message, next_retry_at: nextRetry, updated_at: new Date().toISOString() })
          .eq('task_id', task.task_id);

        await updateEnrichmentStages(supabase, task.work_item_id, task.business_id, {
          [task.task_type]: { status: 'failed', last_error: err.message },
        });

        results.failed++;
      }
    }
  }

  console.log('process-enrichment-queue completed:', { total: tasks.length, ...results });
  return jsonResponse({ processed: tasks.length, ...results });
}

// ── Task processors ───────────────────────────────────────────────────────────

async function processTask(supabase, task) {
  switch (task.task_type) {
    case 'research':  return processResearch(supabase, task);
    case 'bom':       return processBom(supabase, task);
    case 'reestimate': return processReestimate(supabase, task);
    default:
      throw new Error(`Unknown task_type: ${task.task_type}`);
  }
}

async function processResearch(supabase, task) {
  const now = new Date().toISOString();

  // Fetch extraction for fingerprint check
  const { data: item } = await supabase
    .from('work_items')
    .select('extraction_result, research_brief_meta')
    .eq('id', task.work_item_id)
    .single();

  const extraction = item?.extraction_result;
  if (!extraction) throw new Error('No extraction_result on work item');

  // Staleness check: if extraction changed since task was enqueued, skip
  const currentFp = extractionFingerprint(extraction);
  const taskFp = task.payload?.extraction_fingerprint;
  if (taskFp && currentFp !== taskFp) {
    return 'skipped'; // caller marks task succeeded with stale note
  }

  await updateEnrichmentStages(supabase, task.work_item_id, task.business_id, {
    research: { status: 'running', started_at: now },
  });

  const res = await fetch(`${AGENTS_URL}/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task:                 'generate-research-brief',
      businessId:           task.business_id,
      workItemId:           task.work_item_id,
      extractionFingerprint: currentFp,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Agent responded ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();

  // Check if agent skipped (job was confident enough)
  if (data.skipped) {
    await updateEnrichmentStages(supabase, task.work_item_id, task.business_id, {
      research: { status: 'skipped', completed_at: now, last_error: null },
    });
    return 'skipped';
  }

  const brief = data.brief;
  if (!validateResearchBrief(brief)) {
    throw new Error('Invalid research brief schema returned by agent');
  }

  const meta = {
    model_id:              'claude-haiku-5-5',
    generated_at:          now,
    extraction_fingerprint: currentFp,
    source_confidence:     brief.sourceSummary?.overallConfidence ?? null,
  };

  await supabase
    .from('work_items')
    .update({ research_brief: brief, research_brief_meta: meta })
    .eq('id', task.work_item_id)
    .eq('business_id', task.business_id);

  await updateEnrichmentStages(supabase, task.work_item_id, task.business_id, {
    research: { status: 'succeeded', completed_at: now, last_error: null },
  });

  // Trigger re-estimate now that research is available
  await enqueueReestimate(supabase, {
    businessId:       task.business_id,
    workItemId:       task.work_item_id,
    estimationRunId:  task.estimation_run_id,
  });
}

async function processBom(supabase, task) {
  const now = new Date().toISOString();

  // Staleness check
  const { data: item } = await supabase
    .from('work_items')
    .select('extraction_result, materials_bom_meta, materials_bom')
    .eq('id', task.work_item_id)
    .single();

  const extraction = item?.extraction_result;
  if (!extraction) throw new Error('No extraction_result on work item');

  const currentFp = extractionFingerprint(extraction);
  const taskFp = task.payload?.extraction_fingerprint;
  if (taskFp && currentFp !== taskFp) {
    return 'skipped';
  }

  // Skip if BOM already exists with matching fingerprint
  if (item.materials_bom && item.materials_bom_meta?.extraction_fingerprint === currentFp) {
    await updateEnrichmentStages(supabase, task.work_item_id, task.business_id, {
      bom: { status: 'skipped', completed_at: now },
    });
    return 'skipped';
  }

  await updateEnrichmentStages(supabase, task.work_item_id, task.business_id, {
    bom: { status: 'running', started_at: now },
  });

  const res = await fetch(`${AGENTS_URL}/agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      task:                 'price-materials',
      businessId:           task.business_id,
      workItemId:           task.work_item_id,
      extractionFingerprint: currentFp,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Agent responded ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const bom = data.bom;

  if (!validateBom(bom)) {
    throw new Error('Invalid BOM schema returned by agent');
  }

  const meta = {
    generated_at:           now,
    extraction_fingerprint:  currentFp,
    item_count:             bom.materials?.length ?? 0,
    total_mid:              bom.total_mid,
  };

  await supabase
    .from('work_items')
    .update({ materials_bom: bom, materials_bom_meta: meta })
    .eq('id', task.work_item_id)
    .eq('business_id', task.business_id);

  await updateEnrichmentStages(supabase, task.work_item_id, task.business_id, {
    bom: { status: 'succeeded', completed_at: now, last_error: null },
  });

  // Trigger re-estimate now that BOM is available
  await enqueueReestimate(supabase, {
    businessId:      task.business_id,
    workItemId:      task.work_item_id,
    estimationRunId: task.estimation_run_id,
  });
}

async function processReestimate(supabase, task) {
  const now = new Date().toISOString();

  if (!NETLIFY_URL) throw new Error('NETLIFY_URL not configured — cannot re-estimate');

  await updateEnrichmentStages(supabase, task.work_item_id, task.business_id, {
    reestimate: { status: 'running', started_at: now },
  });

  const res = await fetch(`${NETLIFY_URL}/api/re-estimate-job`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workItemId: task.work_item_id, businessId: task.business_id }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`re-estimate-job responded ${res.status}: ${text.slice(0, 200)}`);
  }

  await updateEnrichmentStages(supabase, task.work_item_id, task.business_id, {
    reestimate: { status: 'succeeded', completed_at: now, last_error: null },
  });

  // Check if all enrichment stages are now done — if so, transition to ready_final
  const { data: updatedItem } = await supabase
    .from('work_items')
    .select('enrichment_status, estimate_state')
    .eq('id', task.work_item_id)
    .single();

  const status = updatedItem?.enrichment_status || {};
  const anyStillActive = ['research', 'bom'].some(
    stage => ['pending', 'running'].includes(status[stage]?.status),
  );

  if (!anyStillActive) {
    const reasonFlags = enrichmentReasonFlags(status);
    await transitionEstimateState(supabase, task.work_item_id, task.business_id, 'ready_final', {
      triggeredBy: 'enrichment_worker',
      reason:      `Enrichment complete: ${reasonFlags.join(', ')}`,
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function markSucceeded(supabase, taskId, lastError = null) {
  await supabase
    .from('enrichment_task_queue')
    .update({ status: 'succeeded', last_error: lastError, updated_at: new Date().toISOString() })
    .eq('task_id', taskId);
}

export const config = {
  schedule: '*/5 * * * *',
  path: '/api/process-enrichment-queue',
};
