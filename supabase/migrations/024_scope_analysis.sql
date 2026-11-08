-- 024_scope_analysis.sql
-- Adds scope_analysis (AI-generated clarifying questions) and contractor_notes
-- to work_items. Both are nullable -- only populated for review jobs.

ALTER TABLE work_items ADD COLUMN IF NOT EXISTS scope_analysis jsonb;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS contractor_notes text;
