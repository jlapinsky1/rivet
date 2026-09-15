-- Migration 018: Idempotency key for commercial estimate requests
-- Prevents duplicate jobs when the client retries final submission.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_idempotency_key
  ON jobs (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Server-side email lookup for step 2 (service role only - not exposed to anon)
CREATE OR REPLACE FUNCTION public.commercial_email_registered(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users
    WHERE lower(email) = lower(trim(p_email))
  );
$$;

REVOKE ALL ON FUNCTION public.commercial_email_registered(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.commercial_email_registered(text) TO service_role;
