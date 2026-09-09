-- 022: Feedback loop tables for "who was right?" analysis
-- Adds owner_decisions table and quoted_price to actual_outcomes

-- ─── Owner Decisions ───
-- Records what the owner did with Rivet's recommendation every time.
-- One row per estimation run per action (append-only — re-decisions get new rows).
-- decision_snapshot captures the full situational context at decision time:
--   time (day of week, hour, week number), capacity (remaining hours, jobs done),
--   financials (earnings to date, gap to goal, required pace),
--   queue (depth, total value, total hours).
-- This is the "it was Thursday, 15 hours left, only needed $1k" data
-- that lets us tune around the edges later.

create table if not exists owner_decisions (
  id                   text primary key,
  estimation_run_id    text not null references estimation_runs(id),
  business_id          text not null,
  user_id              text not null,
  rivet_recommendation text not null,    -- 'take' | 'review' | 'pass'
  owner_action         text not null,    -- 'approved' | 'approved_adjusted' | 'declined' | 'reviewed_later'
  rivet_price          double precision not null,
  owner_price          double precision,
  quoted_price         double precision,
  reason_code          text,
  reason_text          text,
  decision_snapshot    jsonb not null,   -- DecisionSnapshot: time, capacity, financial, queue context
  decided_at           timestamptz not null default now()
);

create index if not exists idx_owner_decisions_run on owner_decisions (estimation_run_id);
create index if not exists idx_owner_decisions_business on owner_decisions (business_id);

-- ─── Add quoted_price to actual_outcomes ───
-- What the customer was originally quoted (may differ from final_revenue)

alter table actual_outcomes
  add column if not exists quoted_price double precision;
