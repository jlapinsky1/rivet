import {
  getServiceClient, verifyTurnstile, checkRateLimit,
  getClientIp, jsonResponse, errorResponse,
} from './_shared/supabase.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const { turnstileToken, businessSlug } = await req.json();
    const ip = getClientIp(req);
    const supabase = getServiceClient();

    // Rate limit: 20 sessions per IP per 10 minutes
    const allowed = await checkRateLimit(supabase, ip, 'create-upload-session', 600, 20);
    if (!allowed) {
      return errorResponse('Too many requests. Please wait a few minutes.', 429);
    }

    // Verify Turnstile (if configured)
    if (turnstileToken) {
      const result = await verifyTurnstile(turnstileToken, ip);
      if (!result.success) {
        return errorResponse(result.error, 403);
      }
    }

    // Resolve business_id from slug, or default to first business (Squatterz)
    let businessId;
    if (businessSlug) {
      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .eq('slug', businessSlug)
        .single();
      if (!biz) return errorResponse('Business not found', 404);
      businessId = biz.id;
    } else {
      // Default: first business (backward compat for existing residential flow)
      const { data: biz } = await supabase
        .from('businesses')
        .select('id')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
      if (!biz) return errorResponse('No business configured', 500);
      businessId = biz.id;
    }

    // Create session (expires in 2 hours)
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('upload_sessions')
      .insert({
        business_id: businessId,
        ip_address: ip,
        turnstile_verified: !!turnstileToken,
        expires_at: expiresAt,
      })
      .select('id, max_photos, max_file_bytes, expires_at')
      .single();

    if (error) {
      console.error('Session creation error:', error);
      return errorResponse('Failed to create upload session', 500);
    }

    return jsonResponse({
      sessionId: data.id,
      maxPhotos: data.max_photos,
      maxFileBytes: data.max_file_bytes,
      expiresAt: data.expires_at,
    });
  } catch (e) {
    console.error('create-upload-session error:', e);
    return errorResponse('Server error', 500);
  }
}

export const config = { path: '/api/create-upload-session' };
