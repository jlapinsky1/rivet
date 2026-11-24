/**
 * Shared enrichment orchestrator helpers.
 *
 * Trigger policy, extraction fingerprint, enqueue, and stage update utilities.
 * Used by enrichment-trigger.js and process-enrichment-queue.js.
 */

import crypto from 'crypto';

export const AGENTS_URL = process.env.AGENTS_URL ?? 'https://rivet-agents.onrender.com';
export const NETLIFY_URL = process.env.URL ?? process.env.NETLIFY_URL ?? '';

export const MAX_ATTEMPTS = 5;
export const BACKOFF_SECONDS = [30, 120, 600, 3600, 14400];

// Task components that imply contractor-supplied materials are needed
const MATERIAL_COMPONENTS = new Set([
  'install_sheet_material', 'install_board_or_trim', 'install_structural_lumber',
  'install_decking', 'replace_fixture', 'install_fixture', 'patch_surface',
  'tape_and_mud', 'seal_or_caulk', 'paint_or_touchup', 'cut_and_fit_material',
  'minor_framing', 'set_post', 'build_stairs', 'fasten_or_anchor',
]);

/**
 * Compute a short fingerprint of the extraction fields that drive trigger policy.
 * When this changes, cached enrichment artifacts are stale.
 */
export function extractionFingerprint(extraction) {
  const key = JSON.stringify({
    tradeContexts: [...(extraction.tradeContexts || [])].sort(),
    assemblyCandidate: extraction.assemblyCandidate ?? null,
    unknownsCount: (extraction.unknowns || []).length,
    confidenceBand: Math.floor((extraction.overallConfidence ?? 1) * 10),
  });
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

/**
 * Evaluate which enrichment stages should be triggered for a given work item + extraction.
 *
 * @param {object} extraction  - ExtractionResult from estimation_runs or extraction_result column
 * @param {object} item        - work_items row (enrichment_status, research_brief_meta, materials_bom_meta, materials_bom)
 * @returns {{ shouldResearch: boolean, shouldBom: boolean, fingerprint: string }}
 */
export function evaluateTriggers(extraction, item) {
  const fingerprint = extractionFingerprint(extraction);
  const enrichmentStatus = item.enrichment_status || {};

  // Research: skip if already succeeded with matching fingerprint
  const researchSucceeded =
    enrichmentStatus.research?.status === 'succeeded'
    && item.research_brief_meta?.extraction_fingerprint === fingerprint;

  const shouldResearch = !researchSucceeded && (
    (extraction.overallConfidence ?? 1) < 0.60
    || (extraction.unknowns || []).length >= 2
    || extraction.assemblyCandidate === null
    || ['low', 'unknown'].includes(extraction.reliabilityTier)
  );

  // BOM: skip if cached BOM exists and fingerprint matches
  const bomSucceeded =
    enrichmentStatus.bom?.status === 'succeeded'
    && item.materials_bom_meta?.extraction_fingerprint === fingerprint
    && !!item.materials_bom;

  const impliesMaterials =
    extraction.materialSupplyStatus !== 'customer_supplied'
    && (extraction.tasks || []).some(t => MATERIAL_COMPONENTS.has(t.component));

  const shouldBom = !bomSucceeded && impliesMaterials;

  return { shouldResearch, shouldBom, fingerprint };
}

/**
 * Enqueue enrichment tasks into enrichment_task_queue.
 * Skips any task type that already has a pending or running entry for this work item.
 *
 * @returns {string[]} task types that were actually enqueued
 */
export async function enqueueEnrichmentTasks(supabase, {
  businessId, workItemId, estimationRunId, shouldResearch, shouldBom, fingerprint,
}) {
  if (!shouldResearch && !shouldBom) return [];

  const now = new Date().toISOString();

  // Check for already-active tasks to avoid duplicates
  const { data: active } = await supabase
    .from('enrichment_task_queue')
    .select('task_type')
    .eq('work_item_id', workItemId)
    .in('status', ['pending', 'running']);

  const activeTypes = new Set((active || []).map(r => r.task_type));

  const toEnqueue = [];
  if (shouldResearch && !activeTypes.has('research')) toEnqueue.push('research');
  if (shouldBom && !activeTypes.has('bom')) toEnqueue.push('bom');

  if (toEnqueue.length === 0) return [];

  const rows = toEnqueue.map(taskType => ({
    business_id:       businessId,
    work_item_id:      workItemId,
    estimation_run_id: estimationRunId ?? null,
    task_type:         taskType,
    status:            'pending',
    attempt_count:     0,
    next_retry_at:     now,
    payload:           { extraction_fingerprint: fingerprint },
    created_at:        now,
    updated_at:        now,
  }));

  const { error } = await supabase.from('enrichment_task_queue').insert(rows);
  if (error) throw new Error(`enqueueEnrichmentTasks: ${error.message}`);

  // Mark stages as pending in enrichment_status
  await updateEnrichmentStages(supabase, workItemId, businessId,
    Object.fromEntries(toEnqueue.map(t => [t, { status: 'pending', enqueued_at: now }])),
  );

  return toEnqueue;
}

/**
 * Enqueue a single reestimate task (fires after a research or BOM task succeeds).
 * Skips if one is already active.
 */
export async function enqueueReestimate(supabase, { businessId, workItemId, estimationRunId }) {
  const { data: active } = await supabase
    .from('enrichment_task_queue')
    .select('task_id')
    .eq('work_item_id', workItemId)
    .eq('task_type', 'reestimate')
    .in('status', ['pending', 'running'])
    .limit(1);

  if (active?.length > 0) return; // already queued

  const now = new Date().toISOString();
  await supabase.from('enrichment_task_queue').insert({
    business_id:       businessId,
    work_item_id:      workItemId,
    estimation_run_id: estimationRunId ?? null,
    task_type:         'reestimate',
    status:            'pending',
    attempt_count:     0,
    next_retry_at:     now,
    created_at:        now,
    updated_at:        now,
  });

  await updateEnrichmentStages(supabase, workItemId, businessId, {
    reestimate: { status: 'pending', enqueued_at: now },
  });
}

/**
 * Merge stage updates into work_items.enrichment_status.
 * Read-modify-write — acceptable for the queue volumes in Phase 2.1.
 */
export async function updateEnrichmentStages(supabase, workItemId, businessId, stageUpdates) {
  const { data: item } = await supabase
    .from('work_items')
    .select('enrichment_status')
    .eq('id', workItemId)
    .eq('business_id', businessId)
    .single();

  const current = item?.enrichment_status || {};
  const merged = { ...current };
  for (const [stage, update] of Object.entries(stageUpdates)) {
    merged[stage] = { ...(current[stage] || {}), ...update };
  }

  await supabase
    .from('work_items')
    .update({ enrichment_status: merged })
    .eq('id', workItemId)
    .eq('business_id', businessId);
}

/**
 * Validate a research brief has the required top-level fields.
 */
export function validateResearchBrief(brief) {
  if (!brief || typeof brief !== 'object') return false;
  return (
    typeof brief.probableJobArchetype === 'string'
    && Array.isArray(brief.taskSequence)
    && Array.isArray(brief.criticalUnknowns)
    && ['low', 'standard', 'high'].includes(brief.laborComplexityBand)
  );
}

/**
 * Validate a BOM has the required structure.
 */
export function validateBom(bom) {
  if (!bom || typeof bom !== 'object') return false;
  return Array.isArray(bom.materials) && typeof bom.total_mid === 'number';
}
