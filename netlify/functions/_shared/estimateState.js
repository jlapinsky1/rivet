/**
 * Estimate state management — shared utilities for estimate trust and readiness.
 *
 * Pure functions (safe to import in tests):
 *   computeEstimateDelta, getSendBlockForState, getEnrichmentProgressMessage
 *
 * DB functions (require Supabase client):
 *   transitionEstimateState, expireTimedOutEnrichments
 */

export const ESTIMATE_STATE_ENABLED = process.env.ESTIMATE_STATE_ENABLED !== 'false'; // default on
export const ESTIMATE_STATE_HARD_BLOCK = process.env.ESTIMATE_STATE_HARD_BLOCK === 'true'; // default shadow

export const ENRICHMENT_TIMEOUT_SECONDS = parseInt(process.env.ENRICHMENT_TIMEOUT_SECONDS ?? '180');
export const ENRICHMENT_TIMEOUT_MS = ENRICHMENT_TIMEOUT_SECONDS * 1000;

/** Minimum absolute price change fraction to record a delta (2%). */
const DELTA_THRESHOLD = 0.02;

// ── Pure functions ────────────────────────────────────────────────────────────

/**
 * Compute an estimate delta object if the price change is material (>= DELTA_THRESHOLD).
 * Returns null if the change is below threshold.
 *
 * @param {number} prevPrice
 * @param {number} newPrice
 * @param {number} prevHoursNum
 * @param {number} newHoursNum
 * @param {string[]} reasonFlags  e.g. ['research', 'bom'] or ['manual_reestimate']
 */
export function computeEstimateDelta(prevPrice, newPrice, prevHoursNum, newHoursNum, reasonFlags = []) {
  if (!prevPrice || prevPrice <= 0) return null;
  const deltaAmount = newPrice - prevPrice;
  const deltaPct = deltaAmount / prevPrice;
  if (Math.abs(deltaPct) < DELTA_THRESHOLD) return null;

  return {
    previous_price:  Math.round(prevPrice),
    new_price:       Math.round(newPrice),
    delta_amount:    Math.round(deltaAmount),
    delta_pct:       Math.round(deltaPct * 1000) / 10,   // e.g. 12.3 (%)
    previous_hours:  prevHoursNum ?? null,
    new_hours:       newHoursNum ?? null,
    reason_flags:    reasonFlags,
    recorded_at:     new Date().toISOString(),
  };
}

/**
 * Determine whether the send CTA should be blocked for a given estimate state.
 *
 * Returns:
 *   { blocked: true, reason: string }   — hard block; CTA disabled
 *   { blocked: false, warning: string } — soft warning; CTA enabled but flagged
 *   { blocked: false }                  — clear to send
 *
 * When ESTIMATE_STATE_HARD_BLOCK is false (shadow mode), blocked is always false
 * but reason/warning are still populated for observability.
 */
export function getSendBlockForState(estimateState, enrichmentStatus) {
  // No state set (pre-feature or already finalized) — always clear
  if (!estimateState || estimateState === 'ready_final' || estimateState === 'ready_initial') {
    return { blocked: false };
  }

  if (estimateState === 'pending_enrichment') {
    const reason = getEnrichmentProgressMessage(enrichmentStatus);
    return ESTIMATE_STATE_HARD_BLOCK
      ? { blocked: true, reason }
      : { blocked: false, shadowReason: reason }; // shadow: log but don't block
  }

  if (estimateState === 'ready_initial_with_warning') {
    return { blocked: false, warning: 'Estimate still refining — sending now may underprice.' };
  }

  if (estimateState === 'failed_enrichment') {
    return { blocked: false, warning: 'Enrichment failed — review manually before sending.' };
  }

  return { blocked: false };
}

/**
 * Map enrichment_status to a human-readable progress message.
 * Checks stages in execution order: research → bom → reestimate.
 */
export function getEnrichmentProgressMessage(enrichmentStatus) {
  if (!enrichmentStatus) return 'Finalizing estimate…';
  const { research, bom, reestimate } = enrichmentStatus;
  const active = s => s?.status === 'pending' || s?.status === 'running';
  if (active(research))   return 'Analyzing scope…';
  if (active(bom))        return 'Pricing materials…';
  if (active(reestimate)) return 'Finalizing estimate…';
  return 'Finalizing estimate…';
}

// ── DB functions ──────────────────────────────────────────────────────────────

/**
 * Transition an estimate's state with optimistic concurrency.
 *
 * Uses a WHERE clause on the current estimate_state to prevent concurrent workers
 * from overwriting each other. Silently no-ops if state has already changed.
 *
 * Monotonic rules enforced:
 *   - ready_final cannot regress to any earlier state.
 */
export async function transitionEstimateState(supabase, workItemId, businessId, toState, {
  triggeredBy = 'enrichment_worker',
  reason = null,
} = {}) {
  if (!ESTIMATE_STATE_ENABLED) return;

  const { data: item } = await supabase
    .from('work_items')
    .select('estimate_state, estimate_version')
    .eq('id', workItemId)
    .eq('business_id', businessId)
    .single();

  if (!item) return;

  const fromState = item.estimate_state;
  const currentVersion = item.estimate_version ?? 1;

  // Monotonic rule: ready_final cannot regress
  if (fromState === 'ready_final' && toState !== 'ready_final') return;

  const updates = {
    estimate_state:   toState,
    estimate_version: currentVersion + 1,
  };
  if (toState === 'ready_final' && !item.estimate_finalized_at) {
    updates.estimate_finalized_at = new Date().toISOString();
  }

  // Optimistic lock: only update if state hasn't changed since we read it
  const { error } = await supabase
    .from('work_items')
    .update(updates)
    .eq('id', workItemId)
    .eq('business_id', businessId)
    .eq('estimate_state', fromState);  // optimistic guard

  if (!error) {
    // Audit log — fire and forget
    supabase.from('estimate_state_transitions').insert({
      work_item_id:     workItemId,
      business_id:      businessId,
      from_state:       fromState,
      to_state:         toState,
      estimate_version: currentVersion + 1,
      triggered_by:     triggeredBy,
      reason:           reason ?? null,
    }).then(() => {}).catch(err => console.warn('estimate_state_transitions insert failed:', err.message));
  }
  // If error (concurrent update won), silently skip — idempotent
}

/**
 * Expire pending_enrichment jobs whose enrichment_timeout_at has passed.
 * Sets estimate_state to ready_initial_with_warning.
 * Called at the start of each queue worker run.
 */
export async function expireTimedOutEnrichments(supabase) {
  if (!ESTIMATE_STATE_ENABLED) return;

  const now = new Date().toISOString();

  const { data: timedOut } = await supabase
    .from('work_items')
    .select('id, business_id, estimate_version')
    .eq('estimate_state', 'pending_enrichment')
    .lt('enrichment_timeout_at', now);

  if (!timedOut?.length) return;

  for (const item of timedOut) {
    await transitionEstimateState(supabase, item.id, item.business_id, 'ready_initial_with_warning', {
      triggeredBy: 'timeout',
      reason: `Enrichment not completed within ${ENRICHMENT_TIMEOUT_SECONDS}s`,
    });
    console.warn('[estimate-state] timeout expired for work item', item.id);
  }

  if (timedOut.length > 0) {
    console.log(`[estimate-state] expired ${timedOut.length} timed-out enrichment(s)`);
  }
}

/**
 * Compute reason flags based on which enrichment stages completed successfully.
 */
export function enrichmentReasonFlags(enrichmentStatus) {
  if (!enrichmentStatus) return ['enrichment'];
  const flags = [];
  if (enrichmentStatus.research?.status === 'succeeded') flags.push('research');
  if (enrichmentStatus.bom?.status === 'succeeded') flags.push('bom');
  return flags.length > 0 ? flags : ['enrichment'];
}
