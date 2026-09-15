/**
 * Batching engine - capacity compatibility checks and batch suggestions.
 * Modest implementation for Phase 4.
 */

import { haversineDistance } from './routeContext.js';

const MAX_TRUCK_VOLUME_PCT = 100;

/**
 * Check if a candidate job is compatible with existing scheduled jobs
 * based on truck volume capacity.
 *
 * @param {Array} existingJobs - jobs already scheduled (need internal_estimate.estimatedVolumePct)
 * @param {Object} candidateJob - the job being evaluated
 * @returns {{ compatible: boolean, reason: string|null, combinedVolumePct: number }}
 */
export function checkCapacityCompatibility(existingJobs, candidateJob) {
  const existingVolume = existingJobs.reduce((sum, j) => {
    return sum + (j.internal_estimate?.estimatedVolumePct || 0);
  }, 0);

  const candidateVolume = candidateJob.internal_estimate?.estimatedVolumePct || 0;
  const combined = existingVolume + candidateVolume;

  if (combined > MAX_TRUCK_VOLUME_PCT) {
    return {
      compatible: false,
      reason: `Combined volume ${combined}% exceeds truck capacity (${MAX_TRUCK_VOLUME_PCT}%). Would require a dump trip between jobs.`,
      combinedVolumePct: combined,
    };
  }

  return { compatible: true, reason: null, combinedVolumePct: combined };
}

/**
 * Suggest batching opportunities for a candidate job with scheduled jobs.
 *
 * @param {Object} candidateJob - must have geocoded_lat, geocoded_lng, internal_estimate
 * @param {Array} scheduledJobs - jobs with geocoded coords and internal_estimate
 * @param {{ batchRadiusMiles?: number }} [settings={}]
 * @returns {Array<BatchSuggestion>} sorted by distance
 */
export function suggestBatch(candidateJob, scheduledJobs, settings = {}) {
  const radiusMiles = settings.batchRadiusMiles || 15;
  const targetLat = candidateJob.geocoded_lat;
  const targetLng = candidateJob.geocoded_lng;

  if (!targetLat || !targetLng || !scheduledJobs?.length) return [];

  const suggestions = [];

  for (const job of scheduledJobs) {
    if (job.geocoded_lat == null || job.geocoded_lng == null) continue;

    const dist = haversineDistance(targetLat, targetLng, job.geocoded_lat, job.geocoded_lng);
    if (dist > radiusMiles) continue;

    const capacity = checkCapacityCompatibility([job], candidateJob);

    suggestions.push({
      scheduledJob: job,
      distanceMiles: Math.round(dist * 10) / 10,
      capacityCompatible: capacity.compatible,
      combinedVolumePct: capacity.combinedVolumePct,
      capacityReason: capacity.reason,
      estimatedTravelSavings: estimateTravelSavings(dist),
    });
  }

  suggestions.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return suggestions;
}

/**
 * Rough travel savings estimate from batching nearby jobs.
 * Assumes ~2 min per mile driving, round-trip savings.
 */
function estimateTravelSavings(distanceMiles) {
  return Math.round(distanceMiles * 2 * 2); // ~2 min/mile, save round trip
}
