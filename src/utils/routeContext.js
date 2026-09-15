/**
 * Route context utilities - haversine distance, nearby job lookup, address hashing.
 * Modest implementation for Phase 4.
 */

const EARTH_RADIUS_MILES = 3958.8;

/**
 * Haversine distance between two lat/lng points in miles.
 */
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Normalize an address string for consistent hashing.
 */
function normalizeAddress(address) {
  return address
    .toLowerCase()
    .replace(/[.,#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * SHA-256 hash of a normalized address. Returns hex string.
 * Uses SubtleCrypto in browsers / Node 18+.
 */
export async function hashAddress(address) {
  const normalized = normalizeAddress(address);
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);

  // Browser or Node 20+ with globalThis.crypto
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Node fallback
  const { createHash } = await import('crypto');
  return createHash('sha256').update(normalized).digest('hex');
}

/**
 * Find scheduled jobs near a target location.
 *
 * @param {number} targetLat
 * @param {number} targetLng
 * @param {Array} scheduledJobs - jobs with geocoded_lat / geocoded_lng
 * @param {number} [radiusMiles=15] - search radius
 * @returns {Array<{ job, distanceMiles }>} sorted by distance ascending
 */
export function findNearbyJobs(targetLat, targetLng, scheduledJobs, radiusMiles = 15) {
  if (!targetLat || !targetLng || !scheduledJobs?.length) return [];

  const results = [];
  for (const job of scheduledJobs) {
    const lat = job.geocoded_lat;
    const lng = job.geocoded_lng;
    if (lat == null || lng == null) continue;

    const dist = haversineDistance(targetLat, targetLng, lat, lng);
    if (dist <= radiusMiles) {
      results.push({ job, distanceMiles: Math.round(dist * 10) / 10 });
    }
  }

  results.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return results;
}
