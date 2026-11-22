-- 026: Per-assembly calibration cache
--
-- business_assembly_calibration is the live cache that makes estimates self-heal.
-- It is never read by humans — the estimation engine reads it at job-intake time
-- and the recomputeCalibration() function writes it after every close-out.
--
-- calibration_key is either:
--   • a specific assembly code  (e.g. 'deck_board_replacement')   ← most specific
--   • a trade family            (e.g. 'plumbing', 'electrical')   ← fallback
--
-- This gives a specificity hierarchy: the estimator tries the assembly first,
-- falls back to the family, falls back to no calibration.
--
-- confidence drives how much the system trusts the data:
--   insufficient  < 3 samples  → calibration not applied (too noisy)
--   low           3–5 samples  → 30% blend toward actuals, 70% toward default
--   medium        6–9 samples  → 60% blend
--   high          10+ samples  → full trust

create table if not exists business_assembly_calibration (
  id                   text primary key default gen_random_uuid()::text,
  business_id          text not null,
  calibration_key      text not null,       -- assembly code or trade family
  labor_multiplier     double precision not null default 1.0,
  material_multiplier  double precision not null default 1.0,
  sample_size          int not null default 0,
  confidence           text not null default 'insufficient',
  computed_at          timestamptz not null default now(),
  constraint uq_biz_cal unique (business_id, calibration_key)
);

create index if not exists idx_biz_cal_lookup
  on business_assembly_calibration (business_id, calibration_key);
