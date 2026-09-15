/*
  Commercial Client Portal - authenticated multi-tenant schema

  Tables:
    commercial_clients  – links auth.users to client profile
    properties          – managed properties per client
    jobs                – work orders per property
    job_photos          – before/after documentation
    invoices            – billing per job/property

  Auth model:
    - Clients sign up via Supabase Auth (email + password)
    - A trigger auto-creates a commercial_clients row on signup
    - RLS policies scope ALL data to the authenticated client
    - Admin (service_role) has full access for back-office operations
*/

-- ── commercial_clients ──
CREATE TABLE IF NOT EXISTS commercial_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  company_name text,
  contact_name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE commercial_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_own_profile" ON commercial_clients
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Helper: get current client id from auth context
CREATE OR REPLACE FUNCTION current_client_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT id FROM commercial_clients WHERE user_id = auth.uid();
$$;

-- Auto-create client profile on signup
CREATE OR REPLACE FUNCTION handle_new_client()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.commercial_clients (user_id, contact_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'contact_name', ''))
  ON CONFLICT (user_id) DO UPDATE
    SET contact_name = EXCLUDED.contact_name;
  RETURN NEW;
END;
$$;

ALTER FUNCTION handle_new_client() OWNER TO postgres;
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT INSERT, UPDATE ON commercial_clients TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION handle_new_client() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS on_auth_user_created_client ON auth.users;
CREATE TRIGGER on_auth_user_created_client
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_client();

-- ── properties ──
CREATE TABLE IF NOT EXISTS properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES commercial_clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text NOT NULL,
  primary_contact_name text,
  primary_contact_phone text,
  primary_contact_email text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_own_properties" ON properties
  FOR ALL TO authenticated
  USING (client_id = current_client_id())
  WITH CHECK (client_id = current_client_id());

-- ── jobs ──
CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','scheduled','in_progress','completed','cancelled')),
  unit text,
  description text,
  scheduled_date timestamptz,
  completed_at timestamptz,
  estimate numeric(10,2),
  final_amount numeric(10,2),
  items_removed text,
  completion_notes text,
  access_notes text,
  preferred_date timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_own_jobs" ON jobs
  FOR ALL TO authenticated
  USING (
    property_id IN (
      SELECT id FROM properties WHERE client_id = current_client_id()
    )
  )
  WITH CHECK (
    property_id IN (
      SELECT id FROM properties WHERE client_id = current_client_id()
    )
  );

CREATE INDEX IF NOT EXISTS idx_jobs_property_id ON jobs(property_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_scheduled_date ON jobs(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_jobs_completed_at ON jobs(completed_at DESC);

-- ── job_photos ──
CREATE TABLE IF NOT EXISTS job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('before','after')),
  storage_path text NOT NULL,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE job_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_own_job_photos" ON job_photos
  FOR ALL TO authenticated
  USING (
    job_id IN (
      SELECT j.id FROM jobs j
      JOIN properties p ON p.id = j.property_id
      WHERE p.client_id = current_client_id()
    )
  )
  WITH CHECK (
    job_id IN (
      SELECT j.id FROM jobs j
      JOIN properties p ON p.id = j.property_id
      WHERE p.client_id = current_client_id()
    )
  );

CREATE INDEX IF NOT EXISTS idx_job_photos_job_id ON job_photos(job_id);

-- ── invoices ──
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number text NOT NULL UNIQUE,
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'outstanding'
    CHECK (status IN ('outstanding','paid','overdue','draft')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_own_invoices" ON invoices
  FOR ALL TO authenticated
  USING (
    property_id IN (
      SELECT id FROM properties WHERE client_id = current_client_id()
    )
  )
  WITH CHECK (
    property_id IN (
      SELECT id FROM properties WHERE client_id = current_client_id()
    )
  );

CREATE INDEX IF NOT EXISTS idx_invoices_job_id ON invoices(job_id);
CREATE INDEX IF NOT EXISTS idx_invoices_property_id ON invoices(property_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- ── Storage bucket for job photos ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-photos', 'job-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage: only authenticated clients can upload/read their own photos
CREATE POLICY "clients_read_job_photos" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'job-photos');

CREATE POLICY "clients_upload_job_photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'job-photos');
