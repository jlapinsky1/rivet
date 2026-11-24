-- Auto-Enrichment Orchestrator (Phase 2.1)
-- Adds enrichment_task_queue table and enrichment tracking columns to work_items.

-- ── work_items additions ──────────────────────────────────────────────────────

alter table work_items
  add column if not exists enrichment_status   jsonb,
  add column if not exists research_brief_meta jsonb,
  add column if not exists materials_bom_meta  jsonb;

comment on column work_items.enrichment_status is
  'Per-stage orchestration status: {research, bom, reestimate} each with {status, enqueued_at, completed_at, last_error}';

comment on column work_items.research_brief_meta is
  'Metadata for the stored research brief: model_id, generated_at, extraction_fingerprint, source_confidence';

comment on column work_items.materials_bom_meta is
  'Metadata for the stored materials BOM: generated_at, extraction_fingerprint, source quality signals';

-- ── enrichment_task_queue ─────────────────────────────────────────────────────

create table if not exists enrichment_task_queue (
  task_id          uuid primary key default gen_random_uuid(),
  business_id      text        not null,
  work_item_id     bigint      not null references work_items(id) on delete cascade,
  estimation_run_id text,
  task_type        text        not null check (task_type in ('research', 'bom', 'reestimate')),
  status           text        not null default 'pending'
                               check (status in ('pending', 'running', 'succeeded', 'failed', 'dead_letter')),
  attempt_count    int         not null default 0,
  next_retry_at    timestamptz not null default now(),
  last_error       text,
  payload          jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists enrichment_task_queue_claimable
  on enrichment_task_queue (status, next_retry_at)
  where status in ('pending', 'failed');

create index if not exists enrichment_task_queue_work_item
  on enrichment_task_queue (work_item_id, task_type, status);

-- ── claim_enrichment_tasks() ──────────────────────────────────────────────────
-- Atomically claims a batch of ready tasks using FOR UPDATE SKIP LOCKED.
-- Increments attempt_count and sets status = 'running'.

create or replace function claim_enrichment_tasks(batch_size int default 10)
returns setof enrichment_task_queue
language sql
as $$
  update enrichment_task_queue
  set
    status        = 'running',
    attempt_count = attempt_count + 1,
    updated_at    = now()
  where task_id in (
    select task_id
    from enrichment_task_queue
    where status in ('pending', 'failed')
      and next_retry_at <= now()
    order by created_at
    limit batch_size
    for update skip locked
  )
  returning *;
$$;

-- ── RLS: service role only (no anon access) ───────────────────────────────────

alter table enrichment_task_queue enable row level security;

-- Service role bypasses RLS; no additional policies needed for Netlify functions.
