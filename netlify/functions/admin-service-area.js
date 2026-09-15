import { verifyAdmin, jsonResponse, errorResponse } from './_shared/supabase.js';
import {
  loadServiceAreaConfig,
  saveServiceAreaConfig,
  normalizeAndDedupeZips,
  isValidZip,
  DEFAULT_CONFIG,
} from './_shared/serviceArea.js';

// ── GET /api/admin/service-area ───────────────────────────────────────────────

async function handleGet(req) {
  const user = await verifyAdmin(req);
  if (!user) return errorResponse('Unauthorized', 401);

  try {
    const config = await loadServiceAreaConfig();
    return jsonResponse(config);
  } catch (e) {
    console.error('GET service-area error:', e);
    return errorResponse('Failed to load configuration', 500);
  }
}

// ── PUT /api/admin/service-area ───────────────────────────────────────────────

async function handlePut(req) {
  const user = await verifyAdmin(req);
  if (!user) return errorResponse('Unauthorized', 401);

  let body;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const {
    serviceableZips,
    excludedZips,
    unavailableZips,
    radiusMiles,
    centerZip,
    mode,
  } = body;

  // Validate and normalize each list - invalid ZIPs are silently dropped
  const normalized = {
    serviceableZips: normalizeAndDedupeZips(serviceableZips),
    excludedZips: normalizeAndDedupeZips(excludedZips),
    unavailableZips: normalizeAndDedupeZips(unavailableZips),
  };

  // centerZip is required in radius mode; validate it if provided
  const normalizedCenterZip = (centerZip || '').trim();
  if (normalizedCenterZip && !isValidZip(normalizedCenterZip)) {
    return errorResponse('centerZip must be a five-digit ZIP code');
  }
  if (mode === 'radius' && !normalizedCenterZip) {
    return errorResponse('centerZip is required when using radius mode');
  }

  const validMode = ['zip-list', 'radius'].includes(mode) ? mode : DEFAULT_CONFIG.mode;

  const config = {
    ...DEFAULT_CONFIG,
    ...normalized,
    mode: validMode,
    centerZip: normalizedCenterZip,
    radiusMiles: Math.max(1, Number(radiusMiles) || DEFAULT_CONFIG.radiusMiles),
    updatedAt: new Date().toISOString(),
    updatedBy: user.email || user.id,
  };

  try {
    await saveServiceAreaConfig(config);
    return jsonResponse({ success: true, config });
  } catch (e) {
    console.error('PUT service-area error:', e);
    return errorResponse('Failed to save configuration. Your previous settings are still active.', 500);
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req) {
  if (req.method === 'GET') return handleGet(req);
  if (req.method === 'PUT') return handlePut(req);
  return errorResponse('Method not allowed', 405);
}

export const config = { path: '/api/admin/service-area' };
