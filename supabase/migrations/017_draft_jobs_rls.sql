/*
  017_draft_jobs_rls.sql

  1. Adds 'draft' to the job status constraint - used during onboarding so
     Step 3 can save progress without notifying admins.

  2. Drops custom continuation token columns - the abandoned-onboarding
     resume flow now uses a Supabase-generated magic link instead.

  3. Establishes row-level security for commercial tables so a client can
     only read and modify records belonging to their own authenticated user.
     Clients may insert jobs with status = 'draft' only; all other status
     transitions are performed server-side via the service role.
*/

-- ── 1. Add 'draft' job status ──────────────────────────────────────────────
ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check;

-- Migrate legacy statuses from migration 006 ('open') before adding the new check
UPDATE jobs SET status = 'pending_review' WHERE status = 'open';

ALTER TABLE jobs ADD CONSTRAINT jobs_status_check
  CHECK (status IN (
    'draft', 'pending_review', 'quote_sent', 'awaiting_payment',
    'scheduled', 'in_progress', 'completed', 'cancelled'
  ));
-- Default remains 'pending_review' for non-onboarding job creation.

-- ── 2. Drop custom continuation token columns ──────────────────────────────
-- Replaced by supabase.auth.admin.generateLink({ type: 'magiclink' }).
ALTER TABLE commercial_clients
  DROP COLUMN IF EXISTS continuation_token_hash,
  DROP COLUMN IF EXISTS continuation_token_expires_at;

-- ── 3. RLS - commercial_clients ────────────────────────────────────────────
ALTER TABLE commercial_clients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_select_own_row"   ON commercial_clients;
DROP POLICY IF EXISTS "clients_update_own_row"   ON commercial_clients;

-- A client may only see their own row.
CREATE POLICY "clients_select_own_row" ON commercial_clients
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- A client may update their own profile fields.
-- onboarding_status and last_onboarding_step are managed server-side
-- (service role bypasses this check), so the policy only needs to
-- prevent a different user from modifying the row.
CREATE POLICY "clients_update_own_row" ON commercial_clients
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── 4. RLS - properties ────────────────────────────────────────────────────
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_select_own_properties" ON properties;
DROP POLICY IF EXISTS "clients_insert_own_properties" ON properties;
DROP POLICY IF EXISTS "clients_update_own_properties" ON properties;

CREATE POLICY "clients_select_own_properties" ON properties
  FOR SELECT TO authenticated
  USING (
    client_id IN (
      SELECT id FROM commercial_clients WHERE user_id = auth.uid()
    )
  );

-- The browser supplies client_id during the onboarding insert.
-- This WITH CHECK ensures it can only be the client's own id,
-- so a malicious client_id from the browser is rejected.
CREATE POLICY "clients_insert_own_properties" ON properties
  FOR INSERT TO authenticated
  WITH CHECK (
    client_id IN (
      SELECT id FROM commercial_clients WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "clients_update_own_properties" ON properties
  FOR UPDATE TO authenticated
  USING (
    client_id IN (
      SELECT id FROM commercial_clients WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    client_id IN (
      SELECT id FROM commercial_clients WHERE user_id = auth.uid()
    )
  );

-- ── 5. RLS - jobs ──────────────────────────────────────────────────────────
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_select_own_jobs"  ON jobs;
DROP POLICY IF EXISTS "clients_insert_draft_jobs" ON jobs;

CREATE POLICY "clients_select_own_jobs" ON jobs
  FOR SELECT TO authenticated
  USING (
    property_id IN (
      SELECT p.id FROM properties p
      JOIN commercial_clients cc ON cc.id = p.client_id
      WHERE cc.user_id = auth.uid()
    )
  );

-- Clients may only INSERT jobs with status = 'draft'.
-- All other status changes go through API functions using the service role.
CREATE POLICY "clients_insert_draft_jobs" ON jobs
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'draft'
    AND property_id IN (
      SELECT p.id FROM properties p
      JOIN commercial_clients cc ON cc.id = p.client_id
      WHERE cc.user_id = auth.uid()
    )
  );

-- No UPDATE policy for clients - job updates use the service role only.

-- ── 6. RLS - job_photos ────────────────────────────────────────────────────
ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clients_select_own_job_photos"       ON job_photos;
DROP POLICY IF EXISTS "clients_insert_submission_photos"    ON job_photos;

CREATE POLICY "clients_select_own_job_photos" ON job_photos
  FOR SELECT TO authenticated
  USING (
    job_id IN (
      SELECT j.id FROM jobs j
      JOIN properties p ON p.id = j.property_id
      JOIN commercial_clients cc ON cc.id = p.client_id
      WHERE cc.user_id = auth.uid()
    )
  );

-- Clients may only insert 'submission' kind photos on their own draft jobs.
CREATE POLICY "clients_insert_submission_photos" ON job_photos
  FOR INSERT TO authenticated
  WITH CHECK (
    kind = 'submission'
    AND job_id IN (
      SELECT j.id FROM jobs j
      JOIN properties p ON p.id = j.property_id
      JOIN commercial_clients cc ON cc.id = p.client_id
      WHERE cc.user_id = auth.uid()
        AND j.status = 'draft'
    )
  );
