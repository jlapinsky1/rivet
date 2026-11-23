/**
 * Learning loop SLO metrics endpoint.
 *
 * Returns current status against the three production SLOs defined in
 * LEARNING_LOOP_RELIABILITY_SPEC.md. Intended to be hit by monitoring
 * dashboards, cron health checks, and the runbook.
 *
 * SLO-1: Learning capture completeness — >= 95% of completed jobs have
 *         actual_labor_hours > 0 within 7 days.
 *
 * SLO-2: Calibration freshness latency — p95 <= 5 min from learning-grade
 *         close-out to cache update availability.
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

  // Run all queries in parallel
  const [
    completedJobsResult,
    learningActualsResult,
    latestCalibratedResult,
    latestOutcomeResult,
    queuePendingResult,
    queueDeadLetterResult,
    queueSucceeded24hResult,
    queueFailed24hResult,
    calibCoverageResult,
    recommendationDistResult,
  ] = await Promise.allSettled([

    // SLO-1 denominator: completed bookings older than 7 days
    supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .lte('completed_at', sevenDaysAgo),

    // SLO-1 numerator: learning-grade actuals (actual_labor_hours > 0)
    supabase
      .from('actual_outcomes')
      .select('id', { count: 'exact', head: true })
      .gt('actual_labor_hours', 0),

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

    // Calibration coverage: how many keys exist and what are their confidence tiers?
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

  // ── SLO-1 ──
  const totalCompleted = completedJobsResult.status === 'fulfilled' ? (completedJobsResult.value.count ?? 0) : null;
  const withActuals    = learningActualsResult.status === 'fulfilled' ? (learningActualsResult.value.count ?? 0) : null;
  const captureRate    = (totalCompleted && withActuals !== null) ? withActuals / Math.max(totalCompleted, 1) : null;

  // ── SLO-2 ──
  const latestCalibAt  = latestCalibratedResult.status === 'fulfilled' ? latestCalibratedResult.value.data?.computed_at : null;
  const latestOutcomeAt = latestOutcomeResult.status === 'fulfilled' ? latestOutcomeResult.value.data?.recorded_at : null;
  let freshnessMins = null;
  if (latestCalibAt && latestOutcomeAt) {
    freshnessMins = Math.round((new Date(latestCalibAt).getTime() - new Date(latestOutcomeAt).getTime()) / 60000);
  }

  // ── SLO-3 ──
  const queueDepth    = queuePendingResult.status === 'fulfilled' ? (queuePendingResult.value.count ?? 0) : null;
  const deadLetters   = queueDeadLetterResult.status === 'fulfilled' ? (queueDeadLetterResult.value.count ?? 0) : null;
  const succeeded24h  = queueSucceeded24hResult.status === 'fulfilled' ? (queueSucceeded24hResult.value.count ?? 0) : null;
  const failed24h     = queueFailed24hResult.status === 'fulfilled' ? (queueFailed24hResult.value.count ?? 0) : null;
  const total24h      = (succeeded24h ?? 0) + (failed24h ?? 0);
  const successRate24h = total24h > 0 ? (succeeded24h ?? 0) / total24h : null;

  // ── Recommendation distribution (SLO-5 signal) ──
  const recDist: Record<string, number> = {};
  if (recommendationDistResult.status === 'fulfilled') {
    for (const run of recommendationDistResult.value.data ?? []) {
      recDist[run.recommendation] = (recDist[run.recommendation] ?? 0) + 1;
    }
  }

  // ── Alerts ──
  const alerts: string[] = [];
  if ((deadLetters ?? 0) > 0) {
    alerts.push(`DEAD_LETTER: ${deadLetters} recompute task(s) exhausted retries — check runbook`);
  }
  if (captureRate !== null && totalCompleted !== null && totalCompleted >= 10 && captureRate < 0.95) {
    alerts.push(`SLO-1 breach: learning capture rate is ${Math.round(captureRate * 100)}% (target >= 95%)`);
  }
  if (freshnessMins !== null && freshnessMins > 5) {
    alerts.push(`SLO-2 breach: calibration is ${freshnessMins}m stale (target <= 5m)`);
  }
  if (successRate24h !== null && total24h >= 10 && successRate24h < 0.995) {
    alerts.push(`SLO-3 breach: 24h recompute success rate is ${Math.round(successRate24h * 100)}% (target >= 99.5%)`);
  }

  return jsonResponse({
    generatedAt: now.toISOString(),
    alerts,
    slo1_learningCapture: {
      description: '>= 95% of completed jobs have learning-grade actuals within 7 days',
      completedJobsOver7Days: totalCompleted,
      withLearningGradeActuals: withActuals,
      captureRate: captureRate !== null ? Math.round(captureRate * 1000) / 10 : null, // as percent
      sloMet: captureRate !== null ? captureRate >= 0.95 : null,
    },
    slo2_calibrationFreshness: {
      description: 'p95 <= 5 min from close-out to cache update',
      latestOutcomeAt,
      latestCalibratedAt: latestCalibAt,
      freshnessMinutes: freshnessMins,
      sloMet: freshnessMins !== null ? freshnessMins <= 5 : null,
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
