-- 021_handyman_tenant_tables.sql
-- Adds tenant-scoped tables for handyman work items, customers, companies, properties
-- Uses the business_memberships from 020_multi_tenant.sql (UUID business_id)

-- ─── Work Items ───

CREATE TABLE IF NOT EXISTS work_items (
  id                  bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id         uuid NOT NULL REFERENCES businesses(id),
  title               text NOT NULL,
  source              text NOT NULL DEFAULT 'customer_request',
  customer_type       text NOT NULL DEFAULT 'individual',
  customer_name       text NOT NULL,
  customer_sub        text,
  location            text NOT NULL DEFAULT '',
  travel              text NOT NULL DEFAULT '',
  profit              double precision NOT NULL DEFAULT 0,
  hours               text NOT NULL DEFAULT '',
  hours_num           double precision NOT NULL DEFAULT 0,
  rate                text NOT NULL DEFAULT '',
  rate_num            double precision NOT NULL DEFAULT 0,
  recommendation      text NOT NULL DEFAULT 'review',
  confidence          double precision NOT NULL DEFAULT 0,
  description         text NOT NULL DEFAULT '',
  price               double precision NOT NULL DEFAULT 0,
  costs               double precision NOT NULL DEFAULT 0,
  cost_breakdown      jsonb NOT NULL DEFAULT '[]'::jsonb,
  reasons             jsonb NOT NULL DEFAULT '[]'::jsonb,
  photos              jsonb NOT NULL DEFAULT '[]'::jsonb,
  op_status           text NOT NULL DEFAULT 'needs_review',
  billing_status      text NOT NULL DEFAULT 'not_invoiced',
  preferred_date      text,
  phone               text,
  email               text,
  address             text,
  customer_notes      text,
  company_name        text,
  property_name       text,
  unit_label          text,
  work_order_number   text,
  requested_by        text,
  requested_by_role   text,
  requested_date      text,
  scope               text,
  service_type        text NOT NULL DEFAULT 'Handyman',
  estimation_run_id   text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_items_business ON work_items (business_id);
ALTER TABLE work_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_work_items" ON work_items
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid()));

CREATE POLICY "members_insert_work_items" ON work_items
  FOR INSERT TO authenticated
  WITH CHECK (business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid()));

CREATE POLICY "members_update_work_items" ON work_items
  FOR UPDATE TO authenticated
  USING (business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid()));

-- ─── Customers (individual) ───

CREATE TABLE IF NOT EXISTS customers (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id     uuid NOT NULL REFERENCES businesses(id),
  name            text NOT NULL,
  phone           text,
  email           text,
  address         text,
  job_count       integer NOT NULL DEFAULT 0,
  total_revenue   double precision NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_business ON customers (business_id);
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_customers" ON customers
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid()));

CREATE POLICY "members_insert_customers" ON customers
  FOR INSERT TO authenticated
  WITH CHECK (business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid()));

CREATE POLICY "members_update_customers" ON customers
  FOR UPDATE TO authenticated
  USING (business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid()));

-- ─── Companies (commercial) ───

CREATE TABLE IF NOT EXISTS companies (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  business_id     uuid NOT NULL REFERENCES businesses(id),
  name            text NOT NULL,
  contact_name    text,
  contact_role    text,
  phone           text,
  email           text,
  total_revenue   double precision NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_companies_business ON companies (business_id);
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_companies" ON companies
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid()));

CREATE POLICY "members_insert_companies" ON companies
  FOR INSERT TO authenticated
  WITH CHECK (business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid()));

-- ─── Properties (belong to companies) ───

CREATE TABLE IF NOT EXISTS properties (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id       bigint NOT NULL REFERENCES companies(id),
  business_id      uuid NOT NULL REFERENCES businesses(id),
  name             text NOT NULL,
  address          text,
  unit_count       integer NOT NULL DEFAULT 0,
  work_order_count integer NOT NULL DEFAULT 0,
  units            jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_properties_company ON properties (company_id);
CREATE INDEX IF NOT EXISTS idx_properties_business ON properties (business_id);
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_read_properties" ON properties
  FOR SELECT TO authenticated
  USING (business_id IN (SELECT business_id FROM business_memberships WHERE user_id = auth.uid()));
