import { createClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client using the service role key.
 * Bypasses RLS - use only in Netlify functions, never in client code.
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

  // Check admin_users table - not just "is authenticated"
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
    // No business_id provided - auto-select if user has exactly one business
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
    console.warn('TURNSTILE_SECRET_KEY not set - skipping verification');
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
    return true; // fail open - don't block users due to DB errors
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

/**
 * Read calibration multipliers from the pre-computed cache table.
 *
 * The cache is written by recomputeCalibration() after every job close-out —
 * this function is intentionally cheap: one indexed point-lookup.
 *
 * Returns null when:
 *   • no cache row exists yet (first jobs haven't been closed out)
 *   • confidence is 'insufficient' (< 3 samples — too noisy to trust)
 *
 * Callers should try the most-specific key first, fall back to broader:
 *   loadBusinessCalibration(supabase, biz, 'deck_board_replacement')
 *     ?? loadBusinessCalibration(supabase, biz, 'carpentry')
 *     ?? loadBusinessCalibration(supabase, biz, 'all')
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} businessId
 * @param {string} [calibrationKey] - assembly code, trade family, or 'all'
 * @returns {Promise<{businessId,projectFamily,laborMultiplier,materialMultiplier,sampleSize}|null>}
 */
export async function loadBusinessCalibration(supabase, businessId, calibrationKey) {
  const key = calibrationKey ?? 'all';
  const { data, error } = await supabase
    .from('business_assembly_calibration')
    .select('labor_multiplier, material_multiplier, sample_size, confidence')
    .eq('business_id', businessId)
    .eq('calibration_key', key)
    .maybeSingle();

  if (error || !data || data.confidence === 'insufficient') return null;

  return {
    businessId,
    projectFamily: key,
    laborMultiplier: data.labor_multiplier,
    materialMultiplier: data.material_multiplier,
    sampleSize: data.sample_size,
  };
}

/**
 * Recompute calibration for one (business, calibrationKey) pair and upsert the cache.
 *
 * Called after every job close-out in record-job-actuals.js.
 * No human needed — the system heals itself.
 *
 * calibrationKey can be:
 *   • an assembly code  (e.g. 'exterior_door_replacement') — set isAssembly: true
 *   • a trade family    (e.g. 'plumbing')
 *   • 'all'             — global fallback covering every trade
 *
 * Robust aggregation scales with sample size to resist outliers:
 *   n < 6:   median              — one bad close-out cannot move the estimate
 *   6–19:    trimmed mean        — drop 1 from each tail
 *   20+:     10% trimmed mean    — drop top/bottom 10%
 *
 * Bayesian shrinkage on top: blended = weight × robust + (1 − weight) × 1.0
 * where weight = min(n / 10, 1.0).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} businessId
 * @param {string} calibrationKey  - assembly code, trade family, or 'all'
 * @param {{ isAssembly?: boolean }} [opts]
 */
export async function recomputeCalibration(supabase, businessId, calibrationKey, { isAssembly = false } = {}) {
  try {
    const key = calibrationKey ?? 'all';

    // 1. Load estimation runs for this business matching this key
    const runsQuery = supabase
      .from('estimation_runs')
      .select('id, baseline_estimate')
      .eq('business_id', businessId);

    if (key === 'all') {
      // no additional filter — covers all trades
    } else if (isAssembly) {
      // filter by assemblyUsed stored inside the JSONB baseline_estimate
      runsQuery.filter('baseline_estimate->>assemblyUsed', 'eq', key);
    } else {
      runsQuery.eq('project_family', key);
    }

    const { data: runs } = await runsQuery;
    if (!runs?.length) return;

    // 2. Load actual outcomes — skip revenue-only placeholder rows (actual_labor_hours = 0)
    const { data: outcomes } = await supabase
      .from('actual_outcomes')
      .select('estimation_run_id, actual_labor_hours, actual_material_cost')
      .in('estimation_run_id', runs.map(r => r.id))
      .gt('actual_labor_hours', 0);
    if (!outcomes?.length) return;

    // 3. Compute raw ratios from (estimated vs actual) pairs
    const runsById = new Map(runs.map(r => [r.id, r]));
    const laborRatios = [];
    const materialRatios = [];

    for (const outcome of outcomes) {
      const run = runsById.get(outcome.estimation_run_id);
      if (!run?.baseline_estimate) continue;
      const estLabor = run.baseline_estimate?.laborHours?.expected ?? 0;
      const estMaterial = run.baseline_estimate?.materialCost?.expected ?? 0;
      if (estLabor > 0) laborRatios.push(outcome.actual_labor_hours / estLabor);
      if (estMaterial > 0 && outcome.actual_material_cost > 0) {
        materialRatios.push(outcome.actual_material_cost / estMaterial);
      }
    }

    const n = laborRatios.length;
    if (n === 0) return;

    // 4. Robust aggregation — strategy scales with n to resist outliers
    function robustMean(arr) {
      if (arr.length === 0) return 1.0;
      const sorted = [...arr].sort((a, b) => a - b);
      const len = sorted.length;
      if (len < 6) {
        // median: one outlier cannot move the result
        const mid = Math.floor(len / 2);
        return len % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      }
      // trimmed mean: drop 1 from each tail (small-N) or 10% from each tail (large-N)
      const drop = len < 20 ? 1 : Math.floor(len * 0.10);
      const trimmed = sorted.slice(drop, len - drop);
      return trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
    }

    // 5. Bayesian shrinkage — ramp trust from 0 → 100% as n grows 0 → 10
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const weight = Math.min(n / 10, 1.0);

    const blendedLabor = clamp(weight * robustMean(laborRatios) + (1 - weight) * 1.0, 0.5, 2.0);

    let blendedMaterial = 1.0;
    if (materialRatios.length >= 1) {
      const matWeight = Math.min(materialRatios.length / 10, 1.0);
      blendedMaterial = clamp(matWeight * robustMean(materialRatios) + (1 - matWeight) * 1.0, 0.5, 2.0);
    }

    // 6. Confidence tier
    let confidence;
    if (n < 3)       confidence = 'insufficient'; // calibration not applied
    else if (n < 6)  confidence = 'low';           // median + 30–50% shrinkage
    else if (n < 10) confidence = 'medium';        // trimmed mean + 60–90% shrinkage
    else             confidence = 'high';           // trimmed mean + full trust

    // 7. Write cache — single indexed lookup at every future estimate
    await supabase.from('business_assembly_calibration').upsert({
      business_id:         businessId,
      calibration_key:     key,
      labor_multiplier:    blendedLabor,
      material_multiplier: blendedMaterial,
      sample_size:         n,
      confidence,
      computed_at:         new Date().toISOString(),
    }, { onConflict: 'business_id,calibration_key' });

  } catch (err) {
    console.error('recomputeCalibration (non-fatal):', err.message, { businessId, calibrationKey });
  }
}
