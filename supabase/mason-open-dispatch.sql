-- Mason demo: put open jobs on the dispatch board.
-- Business a0000000-0000-0000-0000-000000000001 only. Does not wipe quotes or history.
--
-- Jobs is today's board.
--   Open work (scheduled, in_progress, approved) with no preferred_date stays
--   on the board every morning until someone marks it complete.
--   A preferred_date of today is gone tomorrow. The status does not flip to completed.
--   Completed rows only show on the day they were finished.
--
-- Full reseed (wipes Mason estimates, decisions, and work items, then inserts
-- the current engine set: queue, one quoted, one scheduled, twelve completed):
--   1. Customers already exist from supabase/seed-mason-data.sql.
--   2. Paste supabase/refresh-mason-production.sql in the Supabase SQL editor.
--
-- Then paste this file. It turns two finished August jobs into open dispatch
-- work so the Jobs tab has something to start and finish.

UPDATE work_items
SET op_status = 'scheduled',
    preferred_date = NULL,
    completed_at = NULL,
    updated_at = now()
WHERE business_id = 'a0000000-0000-0000-0000-000000000001'
  AND id = 2003;

UPDATE work_items
SET op_status = 'in_progress',
    preferred_date = NULL,
    completed_at = NULL,
    updated_at = now()
WHERE business_id = 'a0000000-0000-0000-0000-000000000001'
  AND id = 2006;
