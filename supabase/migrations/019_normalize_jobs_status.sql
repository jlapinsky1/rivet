/*
  019_normalize_jobs_status.sql

  Repair for production DBs still on the migration 006 status constraint
  ('open', 'scheduled', …). You cannot UPDATE to 'pending_review' until
  the old check is dropped.

  Run this, then 015 (if not yet applied), then 017.
*/

-- Inspect current values (optional)
-- SELECT status, count(*) FROM jobs GROUP BY status ORDER BY count DESC;

ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

UPDATE jobs SET status = 'pending_review' WHERE status = 'open';

UPDATE jobs
SET status = 'pending_review'
WHERE status NOT IN (
  'draft', 'pending_review', 'quote_sent', 'awaiting_payment',
  'scheduled', 'in_progress', 'completed', 'cancelled'
);

-- Re-apply the expanded constraint (includes 'draft' from 017).
-- Safe to run even if you will re-run 017 afterward - 017 drops and re-adds this.
ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN (
    'draft', 'pending_review', 'quote_sent', 'awaiting_payment',
    'scheduled', 'in_progress', 'completed', 'cancelled'
  ));

ALTER TABLE jobs ALTER COLUMN status SET DEFAULT 'pending_review';
