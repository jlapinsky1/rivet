/**
 * Agent-accessible service area endpoint.
 *
 * Used by the rivet-agents backend (Render) to read and write the service area
 * configuration on behalf of the contractor advisor. No JWT auth — this is an
 * internal service-to-service endpoint, same pattern as re-estimate-job.
 *
 * GET  /api/agent/service-area          — return current config
 * PUT  /api/agent/service-area          — save full config (agent sends merged payload)
 */

import {
  loadServiceAreaConfig,
  saveServiceAreaConfig,
  normalizeAndDedupeZips,
  isValidZip,
  DEFAULT_CONFIG,
} from './_shared/serviceArea.js';
import { jsonResponse, errorResponse } from './_shared/supabase.js';

async function handleGet() {
  try {
    const config = await loadServiceAreaConfig();
    return jsonResponse(config);
  } catch (e) {
    console.error('agent-service-area GET error:', e);
    return errorResponse('Failed to load service area configuration', 500);
  }
}

async function handlePut(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { serviceableZips, excludedZips, unavailableZips, radiusMiles, centerZip, mode } = body;

  const normalizedCenterZip = (centerZip || '').trim();
  if (normalizedCenterZip && !isValidZip(normalizedCenterZip)) {
    return errorResponse('centerZip must be a five-digit ZIP code');
  }
  if (mode === 'radius' && !normalizedCenterZip) {
    return errorResponse('centerZip is required when using radius mode');
  }

  const config = {
    ...DEFAULT_CONFIG,
    serviceableZips: normalizeAndDedupeZips(serviceableZips),
    excludedZips: normalizeAndDedupeZips(excludedZips),
    unavailableZips: normalizeAndDedupeZips(unavailableZips),
    mode: ['zip-list', 'radius'].includes(mode) ? mode : DEFAULT_CONFIG.mode,
    centerZip: normalizedCenterZip,
    radiusMiles: Math.max(1, Number(radiusMiles) || DEFAULT_CONFIG.radiusMiles),
    updatedAt: new Date().toISOString(),
    updatedBy: 'agent',
  };

  try {
    await saveServiceAreaConfig(config);
    return jsonResponse({ success: true, config });
  } catch (e) {
    console.error('agent-service-area PUT error:', e);
    return errorResponse('Failed to save service area configuration', 500);
  }
}

export default async function handler(req) {
  if (req.method === 'GET') return handleGet();
  if (req.method === 'PUT') return handlePut(req);
  return errorResponse('Method not allowed', 405);
}

export const config = { path: '/api/agent/service-area' };
