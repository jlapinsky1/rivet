/**
 * Learning loop SLO metrics endpoint.
 *
 * Returns current status against the three production SLOs defined in
 * LEARNING_LOOP_RELIABILITY_SPEC.md. Intended to be hit by monitoring
 * dashboards, cron health checks, and the runbook.
 *
 * SLO-1: Learning capture completeness — >= 95% of completed jobs have
 *         actual_labor_hours > 0 within 7 days.
 *         Cohort: bookings completed > 7 days ago that have a linked
 *         work_item (via source_booking_id) → estimation_run_id →
 *         actual_outcomes with actual_labor_hours > 0.
 *
 * SLO-2: Calibration freshness latency — p95 <= 5 min from learning-grade
 *         close-out to cache update availability.
 *         Lag = max(0, outcomeAt - calibAt). Positive = cache is stale.
 *
 * SLO-3: Recompute success rate — >= 99.5% of tasks succeed within 24h.
 *         Dead-letter count > 0 is an immediate alert condition.
 *
 * SLO-5: Reliability safety compliance — 100% of unknown-tier outputs
 *         result in review/pass. This SLO is enforced at the code level
 *         (I5 gate in decision.ts) and tracked via recommendation_distribution.
 *
 * GET /api/learning-metrics  (admin auth required)
 */

import {
  getServiceClient, verifyAdmin,
  jsonResponse, errorResponse,
} from './_shared/supabase.js';

export default async function handler(req) {
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405);

  const admin = await verifyAdmin(req);
  if (!admin) return errorResponse('Unauthorized', 401);

  const supabase = getServiceClient();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo   = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  // ── SLO-1 cohort: bookings completed > 7 days ago ───────────────────────────
  // A3 fix: align numerator and denominator to the same population.
  // Step 1: get booking IDs in the cohort
  const { data: completedBookings } = await supabase
    .from('bookings')
    .select('id')
    .eq('status', 'completed')
    .lte('completed_at', sevenDaysAgo);

  const bookingIds = (completedBookings || []).map(b => b.id);

  // Step 2: find work items linked to those bookings that have an estimation_run_id
  let runIds = [];
  if (bookingIds.length > 0) {
    const { data: linkedItems } = await supabase
      .from('work_items')
      .select('estimation_run_id')
      .in('source_booking_id', bookingIds)
      .not('estimation_run_id', 'is', null);
    runIds = (linkedItems || []).map(w => w.estimation_run_id).filter(Boolean);
  }

  // Step 3: count which of those runs have a learning-grade actual
  let withActuals = 0;
  if (runIds.length > 0) {
    const { count } = await supabase
      .from('actual_outcomes')
      .select('id', { count: 'exact', head: true })
      .in('estimation_run_id', runIds)
      .gt('actual_labor_hours', 0);
    withActuals = count ?? 0;
  }

  const totalCompleted = bookingIds.length;
  const captureRate = totalCompleted > 0 ? withActuals / totalCompleted : null;

  // Run remaining queries in parallel
  const [
    latestCalibratedResult,
    latestOutcomeResult,
    queuePendingResult,
    queueDeadLetterResult,
    queueSucceeded24hResult,
    queueFailed24hResult,
    calibCoverageResult,
    recommendationDistResult,
  ] = await Promise.allSettled([

    // SLO-2: most recent calibration cache update
    supabase
      .from('business_assembly_calibration')
      .select('computed_at')
      .order('computed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // SLO-2: most recent learning-grade close-out
    supabase
      .from('actual_outcomes')
      .select('recorded_at')
      .gt('actual_labor_hours', 0)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle(),

    // SLO-3: queue depth (tasks not yet resolved)
    supabase
      .from('calibration_recompute_queue')
      .select('task_id', { count: 'exact', head: true })
      .in('status', ['pending', 'failed', 'running']),

    // SLO-3: dead-letter count (alert trigger)
    supabase
      .from('calibration_recompute_queue')
      .select('task_id', { count: 'exact', head: true })
      .eq('status', 'dead_letter'),

    // SLO-3: succeeded in last 24h
    supabase
      .from('calibration_recompute_queue')
      .select('task_id', { count: 'exact', head: true })
      .eq('status', 'succeeded')
      .gte('updated_at', oneDayAgo),

    // SLO-3: failed/dead-lettered in last 24h
    supabase
      .from('calibration_recompute_queue')
      .select('task_id', { count: 'exact', head: true })
      .in('status', ['failed', 'dead_letter'])
      .gte('updated_at', oneDayAgo),

    // Calibration coverage: confidence tiers and freshness
    supabase
      .from('business_assembly_calibration')
      .select('calibration_key, confidence, sample_size, computed_at')
      .order('computed_at', { ascending: false }),

    // Recommendation distribution from recent estimation runs
    supabase
      .from('estimation_runs')
      .select('recommendation')
      .gte('created_at', oneDayAgo),

  ]);

  // ── SLO-2: A2 fix — lag = max(0, outcomeAt - calibAt) ──────────────────────
  // Positive lag means the cache is stale relative to the latest close-out.
  // Negative (calibAt > outcomeAt) means cache is fresher than latest outcome — lag = 0.
  const latestCalibAt   = latestCalibratedResult.status === 'fulfilled' ? latestCalibratedResult.value.data?.computed_at : null;
  const latestOutcomeAt = latestOutcomeResult.status === 'fulfilled' ? latestOutcomeResult.value.data?.recorded_at : null;

  let lagMins = null;
  let slo2Met = null;
  if (latestCalibAt && latestOutcomeAt) {
    lagMins = Math.max(0, Math.round((new Date(latestOutcomeAt).getTime() - new Date(latestCalibAt).getTime()) / 60000));
    slo2Met = lagMins <= 5;
  } else if (!latestOutcomeAt) {
    // No learning-grade outcomes yet — SLO not applicable
    slo2Met = null;
  }

  // ── SLO-3 ──
  const queueDepth    = queuePendingResult.status === 'fulfilled' ? (queuePendingResult.value.count ?? 0) : null;
  const deadLetters   = queueDeadLetterResult.status === 'fulfilled' ? (queueDeadLetterResult.value.count ?? 0) : null;
  const succeeded24h  = queueSucceeded24hResult.status === 'fulfilled' ? (queueSucceeded24hResult.value.count ?? 0) : null;
  const failed24h     = queueFailed24hResult.status === 'fulfilled' ? (queueFailed24hResult.value.count ?? 0) : null;
  const total24h      = (succeeded24h ?? 0) + (failed24h ?? 0);
  const successRate24h = total24h > 0 ? (succeeded24h ?? 0) / total24h : null;

  // ── Recommendation distribution (SLO-5 signal) ──
  const recDist = {};
  if (recommendationDistResult.status === 'fulfilled') {
    for (const run of recommendationDistResult.value.data ?? []) {
      recDist[run.recommendation] = (recDist[run.recommendation] ?? 0) + 1;
    }
  }

  // ── Alerts ──
  const alerts = [];
  if ((deadLetters ?? 0) > 0) {
    alerts.push(`DEAD_LETTER: ${deadLetters} recompute task(s) exhausted retries — check runbook`);
  }
  if (captureRate !== null && totalCompleted >= 10 && captureRate < 0.95) {
    alerts.push(`SLO-1 breach: learning capture rate is ${Math.round(captureRate * 100)}% (target >= 95%)`);
  }
  if (lagMins !== null && lagMins > 5) {
    alerts.push(`SLO-2 breach: calibration is ${lagMins}m stale (target <= 5m)`);
  }
  if (successRate24h !== null && total24h >= 10 && successRate24h < 0.995) {
    alerts.push(`SLO-3 breach: 24h recompute success rate is ${Math.round(successRate24h * 100)}% (target >= 99.5%)`);
  }

  return jsonResponse({
    generatedAt: now.toISOString(),
    alerts,
    slo1_learningCapture: {
      description: '>= 95% of completed jobs have learning-grade actuals within 7 days',
      cohortDefinition: 'bookings.completed_at <= 7d ago → work_items.source_booking_id → estimation_runs → actual_outcomes(actual_labor_hours > 0)',
      completedBookingsInCohort: totalCompleted,
      withLearningGradeActuals: withActuals,
      captureRate: captureRate !== null ? Math.round(captureRate * 1000) / 10 : null,
      sloMet: captureRate !== null ? captureRate >= 0.95 : null,
    },
    slo2_calibrationFreshness: {
      description: 'p95 <= 5 min from close-out to cache update (lag = outcomeAt - calibAt)',
      latestOutcomeAt,
      latestCalibratedAt: latestCalibAt,
      lagMinutes: lagMins,
      sloMet: slo2Met,
    },
    slo3_recomputeSuccess: {
      description: '>= 99.5% of recompute tasks succeed within 24h; dead-letter = 0',
      queueDepth,
      deadLetterCount: deadLetters,
      succeeded24h,
      failed24h,
      successRate24h: successRate24h !== null ? Math.round(successRate24h * 1000) / 10 : null,
      sloMet: (deadLetters ?? 0) === 0 && (successRate24h === null || successRate24h >= 0.995),
      deadLetterAlert: (deadLetters ?? 0) > 0,
    },
    calibrationCoverage: calibCoverageResult.status === 'fulfilled' ? calibCoverageResult.value.data ?? [] : [],
    recommendationDistribution24h: recDist,
  });
}

export const config = { path: '/api/learning-metrics' };
