-- Rivet schema — DEV ONLY (no RLS)
-- Run this in the Supabase SQL Editor.

-- ─── Estimation Runs (immutable) ───

create table if not exists estimation_runs (
  id              text primary key,
  business_id     text not null,
  work_id         integer,
  created_at      timestamptz not null default now(),
  project_family  text not null,
  estimator_version text not null,
  ai_model        text not null,
  prompt_version  text not null,
  customer_inputs jsonb not null,
  extraction      jsonb not null,
  baseline_estimate jsonb not null,
  calibration_applied jsonb,
  economic_job    jsonb not null,
  decision_context jsonb not null,
  recommendation  text not null,
  reasons         jsonb not null,
  confidence      double precision not null
);

create index if not exists idx_estimation_runs_business on estimation_runs (business_id);
create index if not exists idx_estimation_runs_work on estimation_runs (work_id);

-- ─── Adjustment Entries (append-only) ───

create table if not exists adjustment_entries (
  id                text primary key,
  estimation_run_id text not null references estimation_runs(id),
  business_id       text not null,
  user_id           text not null,
  field             text not null,
  system_value      double precision not null,
  previous_value    double precision not null,
  new_value         double precision not null,
  reason_code       text not null,
  reason_text       text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_adjustments_run on adjustment_entries (estimation_run_id);

-- ─── Actual Outcomes ───

create table if not exists actual_outcomes (
  id                    text primary key,
  estimation_run_id     text not null references estimation_runs(id),
  actual_labor_hours    double precision not null,
  actual_material_cost  double precision not null,
  actual_procurement_hours double precision not null default 0,
  final_revenue         double precision not null,
  return_trips          integer not null default 0,
  recorded_at           timestamptz not null default now(),
  notes                 text
);

create index if not exists idx_outcomes_run on actual_outcomes (estimation_run_id);
