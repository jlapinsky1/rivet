-- Estimate State Trust (Phase 2.1)
-- Adds deterministic estimate readiness state, versioning, delta tracking,
-- and an audit log for all state transitions.

-- ── work_items additions ──────────────────────────────────────────────────────

alter table work_items
  add column if not exists estimate_state text
    check (estimate_state in (
      'pending_enrichment',
      'ready_initial',
      'ready_final',
      'ready_initial_with_warning',
      'failed_enrichment'
    )),
  add column if not exists estimate_version        integer not null default 1,
  add column if not exists estimate_finalized_at   timestamptz,
  add column if not exists estimate_delta          jsonb,
  add column if not exists enrichment_timeout_at   timestamptz;

comment on column work_items.estimate_state is
  'Estimate readiness: pending_enrichment | ready_initial | ready_final | ready_initial_with_warning | failed_enrichment';
comment on column work_items.estimate_version is
  'Monotonic counter incremented on every re-estimate. Used for optimistic concurrency.';
comment on column work_items.estimate_delta is
  'Price/hours delta from last enrichment-driven re-estimate: {previous_price, new_price, delta_amount, delta_pct, reason_flags, recorded_at}';
comment on column work_items.enrichment_timeout_at is
  'If enrichment has not completed by this time, downgrade to ready_initial_with_warning.';

-- ── estimate_state_transitions (audit log) ────────────────────────────────────

create table if not exists estimate_state_transitions (
  id               uuid primary key default gen_random_uuid(),
  work_item_id     bigint      not null references work_items(id) on delete cascade,
  business_id      text        not null,
  from_state       text,
  to_state         text        not null,
  estimate_version integer,
  triggered_by     text,        -- 'initial' | 'enrichment_worker' | 'timeout' | 'manual_reestimate' | 'dead_letter'
  reason           text,
  created_at       timestamptz not null default now()
);

create index if not exists estimate_state_transitions_work_item
  on estimate_state_transitions (work_item_id, created_at desc);

alter table estimate_state_transitions enable row level security;
-- Service role bypasses RLS; no additional policies needed for Netlify functions.

-- ── Migration for existing work items ────────────────────────────────────────
-- Jobs that already have an estimation_run_id are considered ready_final.
-- Jobs without one are ready_initial (they may have been created pre-estimator).

update work_items
set
  estimate_state   = case
                       when estimation_run_id is not null then 'ready_final'
                       else 'ready_initial'
                     end,
  estimate_version = 1
where estimate_state is null;

-- Back-fill a single audit entry for the initial state of migrated jobs
insert into estimate_state_transitions (work_item_id, business_id, to_state, estimate_version, triggered_by, reason)
select id, business_id, estimate_state, 1, 'initial', 'migration_030'
from work_items
where estimate_state is not null
on conflict do nothing;
