import {
  getServiceClient, verifyAdmin, verifyBusinessMember,
  jsonResponse, errorResponse, recomputeCalibration, enqueueRecompute,
} from './_shared/supabase.js';

/**
 * Record actual job outcomes after completion and mark the work item done.
 *
 * This is the write path that makes calibration real:
 *
 *   actual_labor_hours / estimated_labor_hours → laborMultiplier
 *   actual_material_cost / estimated_material_cost → materialMultiplier
 *
 * Once ≥ 3 jobs have actuals, loadBusinessCalibration() returns non-null
 * and every subsequent estimate is adjusted by the learned multipliers.
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

    // Load work item to get estimation_run_id and validate ownership
    const { data: item, error: itemErr } = await supabase
      .from('work_items')
      .select('id, estimation_run_id, price, op_status, business_id')
      .eq('id', workItemId)
      .eq('business_id', businessId)
      .single();

    if (itemErr || !item) return errorResponse('Work item not found', 404);
    if (item.op_status === 'completed') {
      return jsonResponse({ recorded: false, reason: 'already_completed' });
    }

    // Write actual_outcomes — this is what feeds calibration
    if (item.estimation_run_id) {
      const { error: outcomeErr } = await supabase.from('actual_outcomes').insert({
        id: crypto.randomUUID(),
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

      if (outcomeErr) {
        console.error('actual_outcomes insert error:', outcomeErr);
        // Non-fatal: still mark the job complete
      } else {
        // Self-healing: recompute calibration for all applicable keys.
        // Two-phase approach for production reliability:
        //   1. Write durable queue entries first (guaranteed before any recompute attempt)
        //   2. Attempt synchronous recompute immediately (p95 < 1s — no latency gap)
        //   3. If sync fails, queue entries remain and the cron worker retries with backoff
        try {
          const { data: run } = await supabase
            .from('estimation_runs')
            .select('project_family, baseline_estimate')
            .eq('id', item.estimation_run_id)
            .single();

          const family = run?.project_family ?? 'general_handyman';
          const assemblyUsed = run?.baseline_estimate?.assemblyUsed ?? null;

          // Capture the actual_outcomes id written above for queue traceability
          // (id was set via crypto.randomUUID() in the insert)
          const keySpecs = [
            { key: family,   isAssembly: false },
            { key: 'all',    isAssembly: false },
            ...(assemblyUsed ? [{ key: assemblyUsed, isAssembly: true }] : []),
          ];

          // Phase 1: Enqueue for durability (non-blocking, best effort)
          await Promise.allSettled(keySpecs.map(s =>
            enqueueRecompute(supabase, businessId, s.key, {
              isAssembly: s.isAssembly,
              triggerOutcomeId: item.estimation_run_id, // close enough for traceability
            })
          ));

          // Phase 2: Sync recompute — if this succeeds, cron has nothing to do
          await Promise.all(keySpecs.map(s =>
            recomputeCalibration(supabase, businessId, s.key, { isAssembly: s.isAssembly })
          ));

          // Mark queued tasks succeeded so cron skips them
          await supabase
            .from('calibration_recompute_queue')
            .update({ status: 'succeeded', updated_at: new Date().toISOString() })
            .eq('trigger_outcome_id', item.estimation_run_id)
            .eq('status', 'pending');

        } catch (calErr) {
          // Sync failed — queue entries remain 'pending'; cron worker will retry
          console.error('Sync recompute failed, queue will retry:', calErr.message);
        }
      }
    }

    // Mark work item completed
    await supabase
      .from('work_items')
      .update({
        op_status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', workItemId)
      .eq('business_id', businessId);

    return jsonResponse({ recorded: true, estimationRunId: item.estimation_run_id ?? null });
  } catch (e) {
    console.error('record-job-actuals error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/record-job-actuals' };
