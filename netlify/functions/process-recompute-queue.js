/**
 * Durable calibration recompute worker.
 *
 * Runs on a 5-minute cron schedule to drain the calibration_recompute_queue.
 * Also POST-accessible with admin auth for on-demand triggering (runbook, backfill).
 *
 * Atomic claiming via claim_recompute_tasks() Postgres function uses
 * FOR UPDATE SKIP LOCKED — concurrent invocations never double-process.
 *
 * Failure handling:
 *   attempt 1 → retry in 30s
 *   attempt 2 → retry in 2m
 *   attempt 3 → retry in 10m
 *   attempt 4 → retry in 1h
 *   attempt 5 → dead_letter (alerts, requires runbook)
 */

import {
  getServiceClient, verifyAdmin,
  jsonResponse, errorResponse, recomputeCalibration,
} from './_shared/supabase.js';

const MAX_ATTEMPTS = 5;
const BACKOFF_SECONDS = [30, 120, 600, 3600, 14400];

export default async function handler(req) {
  // Cron invocations are GET; on-demand admin triggers are POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return errorResponse('Method not allowed', 405);
  }

  if (req.method === 'POST') {
    const admin = await verifyAdmin(req);
    if (!admin) return errorResponse('Unauthorized', 401);
  }

  const supabase = getServiceClient();

  // Atomically claim up to 50 tasks — FOR UPDATE SKIP LOCKED prevents double-processing
  const { data: tasks, error: claimErr } = await supabase
    .rpc('claim_recompute_tasks', { batch_size: 50 });

  if (claimErr) {
    console.error('process-recompute-queue: failed to claim tasks:', claimErr.message);
    return errorResponse('Failed to claim tasks', 500);
  }

  if (!tasks?.length) {
    return jsonResponse({ processed: 0, message: 'Queue empty' });
  }

  const results = { succeeded: 0, failed: 0, dead_lettered: 0 };

  for (const task of tasks) {
    try {
      await recomputeCalibration(supabase, task.business_id, task.calibration_key, {
        isAssembly: task.is_assembly,
      });

      await supabase
        .from('calibration_recompute_queue')
        .update({ status: 'succeeded', last_error: null, updated_at: new Date().toISOString() })
        .eq('task_id', task.task_id);

      results.succeeded++;

    } catch (err) {
      // attempt_count was already incremented by claim_recompute_tasks()
      const attempts = task.attempt_count; // post-increment value

      if (attempts >= MAX_ATTEMPTS) {
        await supabase
          .from('calibration_recompute_queue')
          .update({
            status:     'dead_letter',
            last_error: err.message,
            updated_at: new Date().toISOString(),
          })
          .eq('task_id', task.task_id);

        // Dead-letter: log prominently so alerting can pick this up
        console.error('DEAD_LETTER recompute task — manual intervention required', {
          task_id:         task.task_id,
          business_id:     task.business_id,
          calibration_key: task.calibration_key,
          is_assembly:     task.is_assembly,
          attempts,
          error:           err.message,
        });

        results.dead_lettered++;

      } else {
        const backoffSecs = BACKOFF_SECONDS[attempts - 1] ?? 14400;
        const nextRetry = new Date(Date.now() + backoffSecs * 1000).toISOString();

        await supabase
          .from('calibration_recompute_queue')
          .update({
            status:        'failed',
            last_error:    err.message,
            next_retry_at: nextRetry,
            updated_at:    new Date().toISOString(),
          })
          .eq('task_id', task.task_id);

        results.failed++;
      }
    }
  }

  console.log('process-recompute-queue completed:', { total: tasks.length, ...results });
  return jsonResponse({ processed: tasks.length, ...results });
}

// Runs every 5 minutes as a Netlify scheduled function.
// Also reachable at POST /api/process-recompute-queue (admin auth required).
export const config = {
  schedule: '*/5 * * * *',
  path: '/api/process-recompute-queue',
};
