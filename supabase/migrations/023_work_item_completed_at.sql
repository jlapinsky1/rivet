-- 023: completed_at on work_items so this week's clock uses finish date, not create date.
-- Run this in the Supabase SQL editor if you are not applying migrations another way.

ALTER TABLE work_items
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_work_items_completed_at
  ON work_items (business_id, completed_at)
  WHERE completed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION work_items_set_completed_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.op_status = 'completed' THEN
    IF TG_OP = 'INSERT' OR OLD.op_status IS DISTINCT FROM 'completed' THEN
      NEW.completed_at := COALESCE(NEW.completed_at, now());
    END IF;
  ELSE
    NEW.completed_at := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS work_items_set_completed_at ON work_items;
CREATE TRIGGER work_items_set_completed_at
  BEFORE INSERT OR UPDATE ON work_items
  FOR EACH ROW
  EXECUTE FUNCTION work_items_set_completed_at();

-- Existing completed rows keep their original week (created_at), not "today".
UPDATE work_items
SET completed_at = created_at
WHERE op_status = 'completed'
  AND completed_at IS NULL;
