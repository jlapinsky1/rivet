import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client using the service role key.
 * Bypasses RLS — use only in Netlify functions, never in client code.
 */
export function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  return createClient(url, key);
}

/**
 * Verify admin JWT from Authorization header.
 * Checks both Supabase auth AND admin_users table.
 * Returns the authenticated admin user or null.
 */
export async function verifyAdmin(req) {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);

  const supabase = getServiceClient();

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  // Check admin_users table — not just "is authenticated"
  const { count, error: adminErr } = await supabase
    .from('admin_users')
    .select('user_id', { count: 'exact', head: true })
    .eq('user_id', user.id);

  if (adminErr || count === 0) return null;
  return user;
}

/**
 * Verify JWT and business membership.
 * Accepts business_id from explicit param, header, or auto-resolves if user has one business.
 * ALWAYS validates that the authenticated user is a member of the business.
 * Returns { user, businessId } or null.
 */
export async function verifyBusinessMember(req, { businessId: explicitBusinessId } = {}) {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);

  const supabase = getServiceClient();

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  // Resolve business_id: explicit param > header
  const resolvedBusinessId = explicitBusinessId
    || req.headers.get('x-business-id');

  if (!resolvedBusinessId) {
    // No business_id provided — auto-select if user has exactly one business
    const { data: memberships, error: memErr } = await supabase
      .from('business_memberships')
      .select('business_id')
      .eq('user_id', user.id);

    if (memErr || !memberships || memberships.length === 0) return null;
    if (memberships.length === 1) {
      return { user, businessId: memberships[0].business_id };
    }
    // Multiple businesses but none specified
    return null;
  }

  // Validate membership for the specified business
  const { count, error: memErr } = await supabase
    .from('business_memberships')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('business_id', resolvedBusinessId);

  if (memErr || count === 0) return null;
  return { user, businessId: resolvedBusinessId };
}

/**
 * Verify Cloudflare Turnstile token.
 * Returns { success: true } or { success: false, error: string }.
 */
export async function verifyTurnstile(turnstileToken, ip) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    console.warn('TURNSTILE_SECRET_KEY not set — skipping verification');
    return { success: true };
  }

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      secret,
      response: turnstileToken,
      ...(ip && { remoteip: ip }),
    }),
  });

  const data = await res.json();
  if (!data.success) {
    return { success: false, error: 'Verification failed. Please try again.' };
  }
  return { success: true };
}

/**
 * Check rate limit using the Postgres check_rate_limit() function.
 * Returns true if allowed, false if rate-limited.
 */
export async function checkRateLimit(supabase, ip, endpoint, windowSeconds = 300, maxRequests = 10) {
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_ip: ip,
    p_endpoint: endpoint,
    p_window_seconds: windowSeconds,
    p_max_requests: maxRequests,
  });

  if (error) {
    console.error('Rate limit check failed:', error);
    return true; // fail open — don't block users due to DB errors
  }

  return data;
}

/**
 * Extract client IP from request headers (Netlify sets these).
 */
export function getClientIp(req) {
  return req.headers.get('x-nf-client-connection-ip')
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || '0.0.0.0';
}

/**
 * SHA-256 hash a string. Used for quote token hashing.
 */
export async function sha256(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate a cryptographically secure random token.
 */
export function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Verify a commercial portal client JWT.
 * Returns { user, client } if valid, null otherwise.
 */
export async function verifyCommercialClient(req) {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const token = auth.slice(7);

  const supabase = getServiceClient();
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: client } = await supabase
    .from('commercial_clients')
    .select('id, company_name, contact_name, phone, user_id')
    .eq('user_id', user.id)
    .single();

  if (!client) return null;
  return { user, client };
}

/**
 * JSON response helper.
 */
export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(message, status = 400) {
  return jsonResponse({ error: message }, status);
}
