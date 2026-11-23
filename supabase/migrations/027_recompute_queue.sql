-- 027: Durable calibration recompute queue
--
-- Replaces the fire-and-forget recompute pattern with a persistent queue that
-- guarantees at-least-once execution with exponential backoff and dead-letter
-- escalation. The queue is the reliability contract for the learning loop.
--
-- Status lifecycle:
--   pending     → task waiting to be claimed
--   running     → claimed by a worker (in-flight)
--   succeeded   → recompute completed successfully
--   failed      → attempt failed, next_retry_at set for backoff retry
--   dead_letter → max attempts exhausted, requires human/runbook action
--
-- claim_recompute_tasks() uses FOR UPDATE SKIP LOCKED so concurrent workers
-- never double-process the same task.

create table if not exists calibration_recompute_queue (
  task_id           uuid primary key default gen_random_uuid(),
  business_id       text not null,
  calibration_key   text not null,
  is_assembly       boolean not null default false,
  trigger_outcome_id text,                            -- actual_outcomes.id that caused this
  status            text not null default 'pending'
                    check (status in ('pending','running','succeeded','failed','dead_letter')),
  attempt_count     int not null default 0,
  last_error        text,
  next_retry_at     timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Fast index for the worker: "give me tasks ready to run"
create index if not exists idx_recompute_queue_workable
  on calibration_recompute_queue (next_retry_at)
  where status in ('pending', 'failed');

-- Alert index: "are there any dead-letter tasks?"
create index if not exists idx_recompute_queue_dead_letter
  on calibration_recompute_queue (created_at)
  where status = 'dead_letter';

-- Atomic task claiming using FOR UPDATE SKIP LOCKED.
-- Returns up to batch_size tasks and sets them to 'running' in one transaction.
-- Concurrent workers safely skip each other's locked rows.
create or replace function claim_recompute_tasks(batch_size int default 50)
returns setof calibration_recompute_queue
language plpgsql
as $$
begin
  return query
    update calibration_recompute_queue
    set
      status        = 'running',
      attempt_count = attempt_count + 1,
      updated_at    = now()
    where task_id in (
      select task_id
      from calibration_recompute_queue
      where status in ('pending', 'failed')
        and next_retry_at <= now()
      order by next_retry_at
      limit batch_size
      for update skip locked
    )
    returning *;
end;
$$;
