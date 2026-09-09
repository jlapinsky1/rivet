/*
  020_multi_tenant_rivet.sql — Multi-Tenant Foundation (Rivet-only)

  Extracted from 020_multi_tenant.sql — only the parts needed for Rivet:
    1. businesses table
    2. business_memberships table
    3. RLS helper functions
*/

-- ============================================================
-- 1. businesses table
-- ============================================================

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  vertical text NOT NULL CHECK (vertical IN ('junk_removal', 'handyman')),
  timezone text NOT NULL DEFAULT 'America/New_York',
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_businesses_slug ON businesses(slug);
CREATE INDEX IF NOT EXISTS idx_businesses_owner ON businesses(owner_user_id);

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. business_memberships table
-- ============================================================

CREATE TABLE IF NOT EXISTS business_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON business_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_business ON business_memberships(business_id);

ALTER TABLE business_memberships ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS policies (businesses)
-- ============================================================

CREATE POLICY "members_read_businesses" ON businesses
  FOR SELECT TO authenticated
  USING (
    id IN (
      SELECT business_id FROM business_memberships WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "owner_update_business" ON businesses
  FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- ============================================================
-- 4. RLS policies (business_memberships)
-- ============================================================

CREATE POLICY "members_read_memberships" ON business_memberships
  FOR SELECT TO authenticated
  USING (
    business_id IN (
      SELECT bm.business_id FROM business_memberships bm WHERE bm.user_id = auth.uid()
    )
  );

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
-- 5. RLS helper functions
-- ============================================================

CREATE OR REPLACE FUNCTION user_business_ids()
RETURNS uuid[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(business_id), '{}')
  FROM business_memberships
  WHERE user_id = auth.uid();
$$;

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
