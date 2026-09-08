/*
  020_multi_tenant.sql — Multi-Tenant Safety

  Creates the multi-tenant foundation:
    1. businesses table
    2. business_memberships table (replaces admin_users for auth)
    3. RLS helper functions: user_business_ids(), is_business_member()
    4. Adds business_id FK to all tenant-scoped tables
    5. Creates Squatterz as Tenant #1, migrates existing data
    6. Replaces is_admin() RLS policies with business-scoped policies
    7. Updates security-definer functions for business awareness

  IMPORTANT: Memberships are created BEFORE RLS policies are swapped,
  so existing admins are never locked out.
*/

-- ============================================================
-- 1. businesses table
-- ============================================================

CREATE TABLE businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  vertical text NOT NULL CHECK (vertical IN ('junk_removal', 'handyman')),
  timezone text NOT NULL DEFAULT 'America/New_York',
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_businesses_slug ON businesses(slug);
CREATE INDEX idx_businesses_owner ON businesses(owner_user_id);

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Business owners/members can see their businesses
CREATE POLICY "members_read_businesses" ON businesses
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT business_id FROM business_memberships WHERE user_id = auth.uid()
    )
  );

-- Only the owner can update business settings
CREATE POLICY "owner_update_business" ON businesses
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());


-- ============================================================
-- 2. business_memberships table
-- ============================================================

CREATE TABLE business_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, user_id)
);

CREATE INDEX idx_memberships_user ON business_memberships(user_id);
CREATE INDEX idx_memberships_business ON business_memberships(business_id);

ALTER TABLE business_memberships ENABLE ROW LEVEL SECURITY;

-- Members can see other members of their businesses
CREATE POLICY "members_read_memberships" ON business_memberships
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT bm.business_id FROM business_memberships bm WHERE bm.user_id = auth.uid()
    )
  );

-- Only business owners can manage memberships
CREATE POLICY "owner_manage_memberships" ON business_memberships
  FOR ALL TO authenticated
  USING (
    business_id IN (
      SELECT bm.business_id FROM business_memberships bm
      WHERE bm.user_id = auth.uid() AND bm.role = 'owner'
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT bm.business_id FROM business_memberships bm
      WHERE bm.user_id = auth.uid() AND bm.role = 'owner'
    )
  );


-- ============================================================
-- 3. RLS helper functions
-- ============================================================

-- Returns all business IDs the current user belongs to
CREATE OR REPLACE FUNCTION user_business_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(business_id), '{}')
  FROM business_memberships
  WHERE user_id = auth.uid();
$$;

-- Checks if current user is a member of the given business
CREATE OR REPLACE FUNCTION is_business_member(p_business_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_memberships
    WHERE user_id = auth.uid() AND business_id = p_business_id
  );
$$;

-- Keep is_admin() working during transition — now checks business_memberships
-- Any user with at least one membership is considered "admin" for backward compat
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM business_memberships WHERE user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM admin_users WHERE user_id = auth.uid()
  );
$$;


-- ============================================================
-- 4. Add business_id to tenant-scoped tables
-- ============================================================

-- 4a. Core residential tables
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);

ALTER TABLE upload_sessions
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);

ALTER TABLE quote_snapshots
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);

ALTER TABLE quote_tokens
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);

ALTER TABLE slot_reservations
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);

ALTER TABLE quote_acceptances
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);

ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);

-- 4b. Goals & calibration
ALTER TABLE business_goals
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);

ALTER TABLE goal_snapshots
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);

ALTER TABLE calibration_records
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);

-- 4c. Expansion leads
ALTER TABLE expansion_leads
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);

-- 4d. Booking child tables (completions, payment tokens, support notes, issues, notifications)
ALTER TABLE booking_completions
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);

ALTER TABLE payment_access_tokens
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);

ALTER TABLE support_notes
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);

ALTER TABLE job_issues
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);

ALTER TABLE notification_events
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);

-- 4e. Commercial portal tables
ALTER TABLE commercial_clients
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES businesses(id);

-- Properties, jobs, job_photos, invoices derive business scope through
-- commercial_clients → properties chain. No direct business_id needed
-- since RLS already scopes through client_id.


-- ============================================================
-- 5. Create Squatterz as Tenant #1 and migrate existing data
-- ============================================================

-- Create Squatterz business row using the first admin user as owner
DO $$
DECLARE
  v_owner_id uuid;
  v_business_id uuid;
BEGIN
  -- Get the first (likely only) admin user
  SELECT user_id INTO v_owner_id FROM admin_users LIMIT 1;

  -- If no admin exists, skip migration (fresh install)
  IF v_owner_id IS NULL THEN
    RAISE NOTICE 'No admin_users found — skipping Squatterz tenant creation';
    RETURN;
  END IF;

  -- Create the Squatterz business
  INSERT INTO businesses (owner_user_id, name, slug, vertical, timezone)
  VALUES (v_owner_id, 'Squatterz Junk Removal', 'squatterz', 'junk_removal', 'America/New_York')
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_business_id;

  -- Create memberships for ALL existing admin_users
  INSERT INTO business_memberships (business_id, user_id, role)
  SELECT v_business_id, au.user_id, 'owner'
  FROM admin_users au
  ON CONFLICT (business_id, user_id) DO NOTHING;

  -- Backfill business_id on all existing records
  UPDATE bookings SET business_id = v_business_id WHERE business_id IS NULL;
  UPDATE upload_sessions SET business_id = v_business_id WHERE business_id IS NULL;
  UPDATE quote_snapshots SET business_id = v_business_id WHERE business_id IS NULL;
  UPDATE quote_tokens SET business_id = v_business_id WHERE business_id IS NULL;
  UPDATE slot_reservations SET business_id = v_business_id WHERE business_id IS NULL;
  UPDATE quote_acceptances SET business_id = v_business_id WHERE business_id IS NULL;
  UPDATE audit_log SET business_id = v_business_id WHERE business_id IS NULL;
  UPDATE business_goals SET business_id = v_business_id WHERE business_id IS NULL;
  UPDATE goal_snapshots SET business_id = v_business_id WHERE business_id IS NULL;
  UPDATE calibration_records SET business_id = v_business_id WHERE business_id IS NULL;
  UPDATE expansion_leads SET business_id = v_business_id WHERE business_id IS NULL;
  UPDATE booking_completions SET business_id = v_business_id WHERE business_id IS NULL;
  UPDATE payment_access_tokens SET business_id = v_business_id WHERE business_id IS NULL;
  UPDATE support_notes SET business_id = v_business_id WHERE business_id IS NULL;
  UPDATE job_issues SET business_id = v_business_id WHERE business_id IS NULL;
  UPDATE notification_events SET business_id = v_business_id WHERE business_id IS NULL;
  UPDATE commercial_clients SET business_id = v_business_id WHERE business_id IS NULL;

  RAISE NOTICE 'Squatterz tenant created with id: %', v_business_id;
END;
$$;


-- ============================================================
-- 6. Set business_id NOT NULL (after backfill)
-- ============================================================

ALTER TABLE bookings ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE upload_sessions ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE quote_snapshots ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE quote_tokens ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE slot_reservations ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE quote_acceptances ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE audit_log ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE business_goals ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE goal_snapshots ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE calibration_records ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE expansion_leads ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE booking_completions ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE payment_access_tokens ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE support_notes ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE job_issues ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE notification_events ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE commercial_clients ALTER COLUMN business_id SET NOT NULL;


-- ============================================================
-- 7. Create indexes on business_id columns
-- ============================================================

CREATE INDEX idx_bookings_business_id ON bookings(business_id);
CREATE INDEX idx_upload_sessions_business_id ON upload_sessions(business_id);
CREATE INDEX idx_quote_snapshots_business_id ON quote_snapshots(business_id);
CREATE INDEX idx_quote_tokens_business_id ON quote_tokens(business_id);
CREATE INDEX idx_slot_reservations_business_id ON slot_reservations(business_id);
CREATE INDEX idx_quote_acceptances_business_id ON quote_acceptances(business_id);
CREATE INDEX idx_audit_log_business_id ON audit_log(business_id);
CREATE INDEX idx_business_goals_business_id ON business_goals(business_id);
CREATE INDEX idx_goal_snapshots_business_id ON goal_snapshots(business_id);
CREATE INDEX idx_calibration_records_business_id ON calibration_records(business_id);
CREATE INDEX idx_expansion_leads_business_id ON expansion_leads(business_id);
CREATE INDEX idx_booking_completions_business_id ON booking_completions(business_id);
CREATE INDEX idx_payment_access_tokens_business_id ON payment_access_tokens(business_id);
CREATE INDEX idx_support_notes_business_id ON support_notes(business_id);
CREATE INDEX idx_job_issues_business_id ON job_issues(business_id);
CREATE INDEX idx_notification_events_business_id ON notification_events(business_id);
CREATE INDEX idx_commercial_clients_business_id ON commercial_clients(business_id);


-- ============================================================
-- 8. Replace RLS policies with business-scoped policies
-- ============================================================

-- Helper: reusable condition fragment
-- business_id = ANY(user_business_ids())

-- ── 8a. bookings ──
DROP POLICY IF EXISTS "Admins can read bookings" ON bookings;
DROP POLICY IF EXISTS "admin_read_bookings" ON bookings;
CREATE POLICY "business_read_bookings" ON bookings
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

-- ── 8b. upload_sessions ──
-- upload_sessions had no authenticated read policy (service role only for writes)
-- Add business-scoped read for admin dashboard
DROP POLICY IF EXISTS "admin_read_upload_sessions" ON upload_sessions;
CREATE POLICY "business_read_upload_sessions" ON upload_sessions
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

-- ── 8c. quote_snapshots ──
DROP POLICY IF EXISTS "Admins can read snapshots" ON quote_snapshots;
DROP POLICY IF EXISTS "admin_read_snapshots" ON quote_snapshots;
CREATE POLICY "business_read_snapshots" ON quote_snapshots
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

-- ── 8d. quote_tokens ──
DROP POLICY IF EXISTS "Admins can read tokens" ON quote_tokens;
DROP POLICY IF EXISTS "admin_read_tokens" ON quote_tokens;
CREATE POLICY "business_read_tokens" ON quote_tokens
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

-- ── 8e. slot_reservations ──
DROP POLICY IF EXISTS "Admins can manage reservations" ON slot_reservations;
DROP POLICY IF EXISTS "admin_manage_reservations" ON slot_reservations;
CREATE POLICY "business_read_reservations" ON slot_reservations
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

CREATE POLICY "business_write_reservations" ON slot_reservations
  FOR INSERT TO authenticated
  WITH CHECK (business_id = ANY(user_business_ids()));

CREATE POLICY "business_update_reservations" ON slot_reservations
  FOR UPDATE TO authenticated
  USING (business_id = ANY(user_business_ids()));

-- ── 8f. quote_acceptances ──
-- quote_acceptances is append-only, written by service role on customer accept
-- Admin/business read policy:
DROP POLICY IF EXISTS "Admins can read acceptances" ON quote_acceptances;
DROP POLICY IF EXISTS "admin_read_acceptances" ON quote_acceptances;
CREATE POLICY "business_read_acceptances" ON quote_acceptances
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

-- ── 8g. audit_log ──
DROP POLICY IF EXISTS "Admins can read audit log" ON audit_log;
DROP POLICY IF EXISTS "admin_read_audit_log" ON audit_log;
CREATE POLICY "business_read_audit_log" ON audit_log
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

-- ── 8h. business_goals ──
DROP POLICY IF EXISTS "admin_read_goals" ON business_goals;
DROP POLICY IF EXISTS "admin_write_goals" ON business_goals;
CREATE POLICY "business_read_goals" ON business_goals
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

CREATE POLICY "business_write_goals" ON business_goals
  FOR INSERT TO authenticated
  WITH CHECK (business_id = ANY(user_business_ids()));

CREATE POLICY "business_update_goals" ON business_goals
  FOR UPDATE TO authenticated
  USING (business_id = ANY(user_business_ids()));

-- ── 8i. goal_snapshots ──
DROP POLICY IF EXISTS "admin_read_goal_snapshots" ON goal_snapshots;
DROP POLICY IF EXISTS "admin_write_goal_snapshots" ON goal_snapshots;
CREATE POLICY "business_read_goal_snapshots" ON goal_snapshots
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

CREATE POLICY "business_write_goal_snapshots" ON goal_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (business_id = ANY(user_business_ids()));

-- ── 8j. calibration_records ──
DROP POLICY IF EXISTS "admin_read_calibration" ON calibration_records;
DROP POLICY IF EXISTS "admin_write_calibration" ON calibration_records;
CREATE POLICY "business_read_calibration" ON calibration_records
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

CREATE POLICY "business_write_calibration" ON calibration_records
  FOR INSERT TO authenticated
  WITH CHECK (business_id = ANY(user_business_ids()));

-- ── 8k. expansion_leads ──
DROP POLICY IF EXISTS "Admins can read expansion leads" ON expansion_leads;
CREATE POLICY "business_read_expansion_leads" ON expansion_leads
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

-- ── 8l. booking_completions ──
DROP POLICY IF EXISTS "admin_read_completions" ON booking_completions;
CREATE POLICY "business_read_completions" ON booking_completions
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

-- ── 8m. payment_access_tokens ──
DROP POLICY IF EXISTS "admin_read_payment_tokens" ON payment_access_tokens;
CREATE POLICY "business_read_payment_tokens" ON payment_access_tokens
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

-- ── 8n. support_notes ──
DROP POLICY IF EXISTS "admin_read_support_notes" ON support_notes;
CREATE POLICY "business_read_support_notes" ON support_notes
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

-- ── 8o. job_issues ──
DROP POLICY IF EXISTS "admin_read_job_issues" ON job_issues;
DROP POLICY IF EXISTS "admin_insert_job_issues" ON job_issues;
CREATE POLICY "business_read_job_issues" ON job_issues
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

CREATE POLICY "business_insert_job_issues" ON job_issues
  FOR INSERT TO authenticated
  WITH CHECK (business_id = ANY(user_business_ids()));

-- ── 8p. notification_events ──
DROP POLICY IF EXISTS "admin_read_notification_events" ON notification_events;
CREATE POLICY "business_read_notification_events" ON notification_events
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

-- ── 8q. processed_stripe_events — keep global (admin-only, no business_id) ──
-- No changes needed

-- ── 8r. commercial_clients — add business-scoped admin policies ──
-- Keep existing client self-access policies (clients_own_profile, clients_select_own_row, etc.)
-- Add business-scoped admin read
CREATE POLICY "business_admin_read_commercial_clients" ON commercial_clients
  FOR SELECT TO authenticated
  USING (business_id = ANY(user_business_ids()));

-- ── 8s. booking_photos — add business-scoped policy ──
-- booking_photos doesn't have business_id directly; scope through bookings
DROP POLICY IF EXISTS "Admins can read booking photos" ON booking_photos;
DROP POLICY IF EXISTS "admin_read_booking_photos" ON booking_photos;
CREATE POLICY "business_read_booking_photos" ON booking_photos
  FOR SELECT TO authenticated
  USING (
    booking_id IN (
      SELECT id FROM bookings WHERE business_id = ANY(user_business_ids())
    )
  );

-- session_photos — scope through upload_sessions
CREATE POLICY "business_read_session_photos" ON session_photos
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT id FROM upload_sessions WHERE business_id = ANY(user_business_ids())
    )
  );


-- ============================================================
-- 9. Update security-definer functions for business awareness
-- ============================================================

-- admin_delete_booking: now checks business membership instead of is_admin()
CREATE OR REPLACE FUNCTION admin_delete_booking(p_booking_id uuid)
RETURNS void AS $$
DECLARE
  v_business_id uuid;
BEGIN
  SELECT business_id INTO v_business_id FROM bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;
  IF NOT is_business_member(v_business_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SET LOCAL "app.allow_delete" = 'true';
  DELETE FROM bookings WHERE id = p_booking_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- approve_quote_atomic: add business_id parameter, verify membership
CREATE OR REPLACE FUNCTION approve_quote_atomic(
  p_booking_id uuid,
  p_admin_id uuid,
  p_approved_price numeric,
  p_recommended_price numeric,
  p_estimate_snapshot jsonb,
  p_settings_snapshot jsonb,
  p_available_slots jsonb,
  p_expires_at timestamptz,
  p_customer_terms jsonb,
  p_admin_override jsonb,
  p_token_hash text,
  p_decision_context jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking     record;
  v_new_version integer;
  v_snapshot_id uuid;
  v_token_id    uuid;
BEGIN
  -- Verify admin via membership (backward compat: also check admin_users)
  IF NOT EXISTS (SELECT 1 FROM business_memberships WHERE user_id = p_admin_id)
     AND NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = p_admin_id) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Lock booking
  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found';
  END IF;

  -- Verify the admin is a member of this booking's business
  IF NOT EXISTS (
    SELECT 1 FROM business_memberships
    WHERE user_id = p_admin_id AND business_id = v_booking.business_id
  ) AND NOT EXISTS (SELECT 1 FROM admin_users WHERE user_id = p_admin_id) THEN
    RAISE EXCEPTION 'Unauthorized for this business';
  END IF;

  v_new_version := COALESCE(v_booking.quote_version, 0) + 1;

  -- Create immutable snapshot
  INSERT INTO quote_snapshots (
    booking_id, version, approved_price, recommended_price,
    estimate_snapshot, settings_snapshot, available_slots,
    expires_at, customer_terms, admin_override, admin_id,
    decision_context, business_id
  ) VALUES (
    p_booking_id, v_new_version, p_approved_price, p_recommended_price,
    p_estimate_snapshot, p_settings_snapshot, p_available_slots,
    p_expires_at, p_customer_terms, p_admin_override, p_admin_id,
    p_decision_context, v_booking.business_id
  )
  RETURNING id INTO v_snapshot_id;

  -- Revoke previous tokens
  UPDATE quote_tokens
  SET revoked_at = NOW()
  WHERE booking_id = p_booking_id
    AND revoked_at IS NULL;

  -- Log revocations
  INSERT INTO audit_log (booking_id, event_type, admin_id, metadata, business_id)
  SELECT p_booking_id, 'token_revoked', p_admin_id,
    jsonb_build_object('token_id', id, 'reason', 'superseded_by_v' || v_new_version),
    v_booking.business_id
  FROM quote_tokens
  WHERE booking_id = p_booking_id
    AND revoked_at = NOW();

  -- Create new token
  INSERT INTO quote_tokens (
    booking_id, quote_snapshot_id, token_hash, expires_at, business_id
  ) VALUES (
    p_booking_id, v_snapshot_id, p_token_hash, p_expires_at, v_booking.business_id
  )
  RETURNING id INTO v_token_id;

  -- Update booking
  UPDATE bookings SET
    status = 'quote_sent',
    quote_version = v_new_version,
    approved_quote = p_approved_price,
    quote_expires_at = p_expires_at,
    approved_at = NOW(),
    quote_token_hash = p_token_hash,
    internal_estimate = p_estimate_snapshot
  WHERE id = p_booking_id;

  -- Audit: approval
  INSERT INTO audit_log (
    booking_id, event_type, admin_id, after_value, metadata, business_id
  ) VALUES (
    p_booking_id, 'quote_approved', p_admin_id,
    jsonb_build_object('approved_price', p_approved_price, 'version', v_new_version),
    jsonb_build_object('snapshot_id', v_snapshot_id, 'token_id', v_token_id),
    v_booking.business_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'version', v_new_version,
    'snapshot_id', v_snapshot_id,
    'token_id', v_token_id
  );
END;
$$;

-- initiate_payment_atomic: propagate business_id to child rows
CREATE OR REPLACE FUNCTION initiate_payment_atomic(
  p_token_hash      text,
  p_resource_id     text,
  p_pickup_date     date,
  p_start_time      time,
  p_end_time        time,
  p_confirmations   jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token          record;
  v_snapshot       record;
  v_booking        record;
  v_reservation_id uuid;
  v_generic_error  jsonb := jsonb_build_object(
    'success', false, 'error', 'Unable to process this request'
  );
BEGIN
  PERFORM cleanup_expired_slot_reservations();

  SELECT * INTO v_token
  FROM quote_tokens
  WHERE token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND
    OR v_token.revoked_at IS NOT NULL
    OR v_token.expires_at < now()
    OR v_token.used_at IS NOT NULL
  THEN
    RETURN v_generic_error;
  END IF;

  SELECT * INTO v_snapshot
  FROM quote_snapshots
  WHERE id = v_token.quote_snapshot_id;

  IF NOT FOUND OR v_snapshot.expires_at < now() THEN
    RETURN v_generic_error;
  END IF;

  SELECT * INTO v_booking
  FROM bookings
  WHERE id = v_token.booking_id
  FOR UPDATE;

  IF NOT FOUND THEN RETURN v_generic_error; END IF;

  IF v_booking.status = 'awaiting_deposit' THEN
    SELECT id INTO v_reservation_id
    FROM slot_reservations
    WHERE booking_id = v_booking.id
      AND status IN ('reserved', 'confirmed')
    ORDER BY reserved_at DESC
    LIMIT 1;

    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'booking_id', v_booking.id,
      'reservation_id', v_reservation_id,
      'approved_price_cents', (v_snapshot.approved_price * 100)::bigint,
      'quote_version', v_snapshot.version
    );
  END IF;

  IF v_booking.status != 'quote_sent' THEN
    RETURN v_generic_error;
  END IF;

  IF p_confirmations IS NULL OR jsonb_array_length(p_confirmations) < 3 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'All confirmations are required'
    );
  END IF;

  BEGIN
    INSERT INTO slot_reservations (
      booking_id, resource_id, pickup_date, start_time, end_time,
      status, expires_at, business_id
    ) VALUES (
      v_booking.id, p_resource_id, p_pickup_date, p_start_time, p_end_time,
      'reserved', now() + interval '30 minutes', v_booking.business_id
    )
    RETURNING id INTO v_reservation_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'That time slot was just taken. Please choose another.'
    );
  END;

  UPDATE bookings SET
    status = 'awaiting_deposit',
    accepted_quote_snapshot_id = v_snapshot.id
  WHERE id = v_booking.id;

  INSERT INTO audit_log (booking_id, event_type, metadata, business_id) VALUES (
    v_booking.id,
    'deposit_initiated',
    jsonb_build_object(
      'snapshot_version', v_snapshot.version,
      'reservation_id', v_reservation_id,
      'slot_expires_at', (now() + interval '30 minutes')::text
    ),
    v_booking.business_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', v_booking.id,
    'snapshot_id', v_snapshot.id,
    'reservation_id', v_reservation_id,
    'approved_price_cents', (v_snapshot.approved_price * 100)::bigint,
    'quote_version', v_snapshot.version
  );
END;
$$;

-- confirm_deposit_atomic: propagate business_id to audit_log
CREATE OR REPLACE FUNCTION confirm_deposit_atomic(
  p_booking_id                  uuid,
  p_deposit_payment_intent_id   text,
  p_invoice_payment_id          text,
  p_token_hash                  text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_booking record;
BEGIN
  SELECT * INTO v_booking
  FROM bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
  END IF;

  IF v_booking.deposit_confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'idempotent', true);
  END IF;

  UPDATE bookings SET
    status = 'scheduled',
    deposit_confirmed_at = now(),
    stripe_deposit_payment_intent_id = p_deposit_payment_intent_id
  WHERE id = p_booking_id;

  UPDATE slot_reservations SET
    status = 'confirmed',
    expires_at = NULL
  WHERE booking_id = p_booking_id
    AND status = 'reserved';

  IF p_token_hash IS NOT NULL THEN
    UPDATE quote_tokens SET used_at = now()
    WHERE token_hash = p_token_hash
      AND used_at IS NULL;
  END IF;

  INSERT INTO audit_log (booking_id, event_type, metadata, business_id) VALUES (
    p_booking_id,
    'deposit_confirmed',
    jsonb_build_object(
      'payment_intent_id', p_deposit_payment_intent_id,
      'invoice_payment_id', p_invoice_payment_id
    ),
    v_booking.business_id
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- queue_dispatch_notification: propagate business_id to notification_events
CREATE OR REPLACE FUNCTION queue_dispatch_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_type text;
BEGIN
  v_event_type := CASE NEW.status
    WHEN 'en_route'    THEN 'crew_en_route'
    WHEN 'arrived'     THEN 'crew_arrived'
    WHEN 'in_progress' THEN 'job_started'
    WHEN 'completed'   THEN 'job_completed'
    ELSE NULL
  END;

  IF v_event_type IS NULL OR OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  BEGIN
    INSERT INTO notification_events (booking_id, event_type, destination, payload, business_id)
    VALUES (
      NEW.id,
      v_event_type,
      NEW.customer_phone,
      jsonb_build_object(
        'customerName', NEW.customer_name,
        'bookingId',    NEW.id,
        'status',       NEW.status
      ),
      NEW.business_id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'queue_dispatch_notification: could not queue % for booking %: %',
      v_event_type, NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;


-- ============================================================
-- 10. Fix handle_new_client trigger
-- ============================================================
-- The existing trigger auto-creates a commercial_clients row for EVERY
-- auth.users INSERT. In multi-tenant, not every user is a commercial client.
-- We need to make this conditional — only create if the user signed up
-- through the commercial portal (indicated by raw_user_meta_data).

CREATE OR REPLACE FUNCTION handle_new_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only auto-create commercial client if the user was created through
  -- the commercial portal (has 'contact_name' or 'commercial_signup' in metadata)
  IF NEW.raw_user_meta_data ? 'contact_name'
     OR (NEW.raw_user_meta_data->>'commercial_signup')::boolean = true THEN
    INSERT INTO public.commercial_clients (user_id, contact_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'contact_name', ''))
    ON CONFLICT (user_id) DO UPDATE
      SET contact_name = EXCLUDED.contact_name;
  END IF;
  RETURN NEW;
END;
$$;
