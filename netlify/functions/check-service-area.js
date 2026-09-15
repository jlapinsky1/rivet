import { getServiceClient, getClientIp, checkRateLimit, jsonResponse, errorResponse } from './_shared/supabase.js';
import { isValidZip, evaluateZip, loadServiceAreaConfig } from './_shared/serviceArea.js';

export default async function handler(req) {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  try {
    const body = await req.json();
    const zip = (body?.zip || '').trim();

    if (!zip) return errorResponse('zip is required');

    if (!isValidZip(zip)) {
      return jsonResponse({ serviceable: false, reason: 'invalid_zip' });
    }

    // Rate limit: 30 checks per IP per 5 minutes
    try {
      const supabase = getServiceClient();
      const ip = getClientIp(req);
      const allowed = await checkRateLimit(supabase, ip, 'check-service-area', 300, 30);
      if (!allowed) return errorResponse('Too many requests. Please wait a moment and try again.', 429);
    } catch {
      // Supabase not configured - skip rate limiting
    }

    let config;
    try {
      config = await loadServiceAreaConfig();
    } catch {
      // Fail open if config cannot be loaded
      return jsonResponse({ serviceable: true, reason: 'error' });
    }

    return jsonResponse(evaluateZip(zip, config));
  } catch (e) {
    console.error('check-service-area error:', e);
    // Fail open on unexpected server errors
    return jsonResponse({ serviceable: true, reason: 'error' });
  }
}

export const config = { path: '/api/check-service-area' };
