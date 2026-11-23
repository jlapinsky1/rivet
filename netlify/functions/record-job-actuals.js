import {
  getServiceClient, verifyAdmin, verifyBusinessMember,
  jsonResponse, errorResponse, recomputeCalibration, enqueueRecompute,
} from './_shared/supabase.js';

/**
 * Record actual job outcomes after completion and trigger calibration recompute.
 *
 * This is the write path that makes calibration real:
 *
 *   actual_labor_hours / estimated_labor_hours → laborMultiplier
 *   actual_material_cost / estimated_material_cost → materialMultiplier
 *
 * Once >= 3 jobs have actuals, loadBusinessCalibration() returns non-null
 * and every subsequent estimate is adjusted by the learned multipliers.
 *
 * A1 — Enqueue durability: Both the actual_outcomes insert AND all queue
 *   inserts are fatal. If any queue insert fails the handler returns 500 so
 *   the caller can retry. The sync recompute is still non-fatal (queue
 *   guarantees retry if it fails).
 *
 * A4 — Allow completed close-out: op_status === 'completed' is NOT an early
 *   return. Idempotency is enforced by checking for an existing learning-grade
 *   actual (actual_labor_hours > 0) for the same estimation_run_id.
 *
 * Required: workItemId, businessId, actualLaborHours
 * Optional: actualMaterialCost, finalRevenue, notes
 */
export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const bizAuth = await verifyBusinessMember(req);
    const admin = bizAuth?.user || await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);

    const {
      workItemId,
      businessId,
      actualLaborHours,
      actualMaterialCost,
      finalRevenue,
      notes,
    } = await req.json();

    if (!workItemId || !businessId) return errorResponse('workItemId and businessId are required');
    if (typeof actualLaborHours !== 'number' || actualLaborHours <= 0) {
      return errorResponse('actualLaborHours must be a positive number');
    }

    const supabase = getServiceClient();

    // Load work item to get estimation_run_id and validate ownership.
    // No early return for completed items — A4 allows close-out on completed work.
    const { data: item, error: itemErr } = await supabase
      .from('work_items')
      .select('id, estimation_run_id, price, op_status, business_id')
      .eq('id', workItemId)
      .eq('business_id', businessId)
      .single();

    if (itemErr || !item) return errorResponse('Work item not found', 404);

    // Write actual_outcomes — feeds calibration
    if (item.estimation_run_id) {
      // A4 — idempotency: if a learning-grade actual already exists for this run, skip
      const { data: existing } = await supabase
        .from('actual_outcomes')
        .select('id')
        .eq('estimation_run_id', item.estimation_run_id)
        .gt('actual_labor_hours', 0)
        .maybeSingle();

      if (existing) {
        // Already recorded — still mark complete if needed, then return
        if (item.op_status !== 'completed') {
          await supabase
            .from('work_items')
            .update({ op_status: 'completed', completed_at: new Date().toISOString() })
            .eq('id', workItemId)
            .eq('business_id', businessId);
        }
        return jsonResponse({ recorded: false, reason: 'already_recorded' });
      }

      // A1 — Generate outcomeId before insert so we can use it as triggerOutcomeId
      const outcomeId = crypto.randomUUID();

      const { error: outcomeErr } = await supabase.from('actual_outcomes').insert({
        id: outcomeId,
        estimation_run_id: item.estimation_run_id,
        actual_labor_hours: actualLaborHours,
        actual_material_cost: actualMaterialCost ?? 0,
        actual_procurement_hours: 0,
        final_revenue: finalRevenue ?? item.price,
        return_trips: 0,
        quoted_price: item.price,
        recorded_at: new Date().toISOString(),
        notes: notes ?? null,
      });

      // A1 — actual_outcomes insert is fatal; without it calibration never learns
      if (outcomeErr) {
        console.error('actual_outcomes insert error:', outcomeErr);
        return errorResponse('Failed to record actuals', 500);
      }

      // Self-healing calibration — two-phase for production reliability:
      //   Phase 1: Enqueue (durable) — FATAL. If queue write fails, caller must retry.
      //   Phase 2: Sync recompute — non-fatal. Queue retries if this fails.
      try {
        const { data: run } = await supabase
          .from('estimation_runs')
          .select('project_family, baseline_estimate')
          .eq('id', item.estimation_run_id)
          .single();

        const family = run?.project_family ?? 'general_handyman';
        const assemblyUsed = run?.baseline_estimate?.assemblyUsed ?? null;

        const keySpecs = [
          { key: family, isAssembly: false },
          { key: 'all',  isAssembly: false },
          ...(assemblyUsed ? [{ key: assemblyUsed, isAssembly: true }] : []),
        ];

        // Phase 1: A1 — strict enqueue, all-or-nothing
        await Promise.all(keySpecs.map(s =>
          enqueueRecompute(supabase, businessId, s.key, {
            isAssembly: s.isAssembly,
            triggerOutcomeId: outcomeId,
          })
        ));

        // Phase 2: sync recompute — non-fatal, queue covers retry
        try {
          await Promise.all(keySpecs.map(s =>
            recomputeCalibration(supabase, businessId, s.key, { isAssembly: s.isAssembly })
          ));

          // Mark queued tasks succeeded so cron skips them
          await supabase
            .from('calibration_recompute_queue')
            .update({ status: 'succeeded', updated_at: new Date().toISOString() })
            .eq('trigger_outcome_id', outcomeId)
            .eq('status', 'pending');

        } catch (syncErr) {
          // Sync failed — queue entries remain 'pending'; cron will retry with backoff
          console.error('Sync recompute failed, queue will retry:', syncErr.message);
        }

      } catch (enqueueErr) {
        // A1 — enqueue failure is fatal; return 500 so caller retries the whole request
        console.error('Enqueue failed (fatal):', enqueueErr.message);
        return errorResponse('Failed to queue calibration recompute', 500);
      }
    }

    // Mark work item completed — skip if already completed (A4: completed items are valid)
    if (item.op_status !== 'completed') {
      await supabase
        .from('work_items')
        .update({ op_status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', workItemId)
        .eq('business_id', businessId);
    }

    return jsonResponse({ recorded: true, estimationRunId: item.estimation_run_id ?? null });
  } catch (e) {
    console.error('record-job-actuals error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/record-job-actuals' };
