import { VARIANCE_FIELDS, computeMetrics } from './varianceAnalysis.js';
import { SIMILARITY_DIMENSIONS, groupJobsByDimension } from './similarityGroups.js';

export const CALIBRATION_THRESHOLDS = {
  weak: 5,
  strong: 10,
  veryStrong: 20,
};

// Only suggest a change when signed bias exceeds 15%
export const SIGNIFICANCE_THRESHOLD = 0.15;

// Maximum single adjustment: 30%
export const MAX_ADJUSTMENT_PCT = 0.30;

/**
 * Map metric + dimension to the settings field it would adjust.
 */
const METRIC_TO_SETTING = {
  'disposalCost:default': { path: 'dumpFee', label: 'Dump fee per load' },
  'onSiteMinutes:quantity': { path: 'baseHours', label: 'Base on-site hours' },
  'travelMinutes:default': { path: 'defaultTravel', label: 'Default travel estimate' },
};

/**
 * Determine confidence level from sample size.
 */
export function getConfidence(sampleSize) {
  if (sampleSize >= CALIBRATION_THRESHOLDS.veryStrong) return 'very_strong';
  if (sampleSize >= CALIBRATION_THRESHOLDS.strong) return 'strong';
  if (sampleSize >= CALIBRATION_THRESHOLDS.weak) return 'weak';
  return null; // insufficient
}

/**
 * Generate calibration suggestions from completed bookings.
 *
 * Uses signed bias (not MAPE alone) to determine adjustment direction.
 * Only suggests changes when there's a consistent directional error.
 *
 * @param {Array} completedBookings - bookings with actuals and internal_estimate
 * @param {Object} currentSettings - current pricing settings
 * @returns {Array<CalibrationSuggestion>}
 */
export function generateCalibrationSuggestions(completedBookings, currentSettings) {
  const suggestions = [];

  // 1. Overall field-level analysis
  for (const [fieldKey, field] of Object.entries(VARIANCE_FIELDS)) {
    const pairs = [];
    const jobIds = [];
    for (const b of completedBookings) {
      const pair = field.extract(b);
      if (pair) {
        pairs.push(pair);
        jobIds.push(b.id);
      }
    }

    const metrics = computeMetrics(pairs, field.minDenominator || 10);
    if (!metrics) continue;

    const confidence = getConfidence(metrics.sampleSize);
    if (!confidence) continue; // not enough data

    // Use signed average error for direction
    const signedBias = metrics.signedAvgError;
    const avgEstimated = pairs.reduce((s, p) => s + p.estimated, 0) / pairs.length;

    // Skip if denominator is too small for relative comparison
    if (Math.abs(avgEstimated) < (field.minDenominator || 10)) continue;

    const relativeBias = signedBias / avgEstimated;

    // Only suggest if bias exceeds significance threshold
    if (Math.abs(relativeBias) < SIGNIFICANCE_THRESHOLD) continue;

    // Cap adjustment
    const cappedBias = Math.sign(relativeBias) * Math.min(Math.abs(relativeBias), MAX_ADJUSTMENT_PCT);
    const currentValue = avgEstimated;
    const suggestedValue = round2(currentValue * (1 + cappedBias));

    const direction = signedBias > 0 ? 'increase' : 'decrease';
    const magnitude = round2(Math.abs(cappedBias) * 100);

    suggestions.push({
      metric: fieldKey,
      dimension: 'overall',
      dimensionValue: 'all',
      currentValue: round2(currentValue),
      suggestedValue,
      sampleSize: metrics.sampleSize,
      confidence,
      direction,
      magnitude,
      signedBias: round2(signedBias),
      mape: metrics.mape,
      reasoning: buildReasoning(field.label, direction, magnitude, metrics, confidence),
      supportingJobIds: jobIds,
    });
  }

  // 2. Per-dimension analysis for key dimensions
  const keyDimensions = ['accessType', 'quantity', 'volumeBand'];
  for (const dimKey of keyDimensions) {
    const groups = groupJobsByDimension(completedBookings, dimKey);

    for (const [groupValue, groupJobs] of groups) {
      if (groupValue === 'unknown') continue;

      for (const [fieldKey, field] of Object.entries(VARIANCE_FIELDS)) {
        const pairs = [];
        const jobIds = [];
        for (const b of groupJobs) {
          const pair = field.extract(b);
          if (pair) {
            pairs.push(pair);
            jobIds.push(b.id);
          }
        }

        const metrics = computeMetrics(pairs, field.minDenominator || 10);
        if (!metrics) continue;

        const confidence = getConfidence(metrics.sampleSize);
        if (!confidence) continue;

        const avgEstimated = pairs.reduce((s, p) => s + p.estimated, 0) / pairs.length;
        if (Math.abs(avgEstimated) < (field.minDenominator || 10)) continue;

        const relativeBias = metrics.signedAvgError / avgEstimated;
        if (Math.abs(relativeBias) < SIGNIFICANCE_THRESHOLD) continue;

        const cappedBias = Math.sign(relativeBias) * Math.min(Math.abs(relativeBias), MAX_ADJUSTMENT_PCT);
        const suggestedValue = round2(avgEstimated * (1 + cappedBias));
        const direction = metrics.signedAvgError > 0 ? 'increase' : 'decrease';
        const magnitude = round2(Math.abs(cappedBias) * 100);

        const dimLabel = SIMILARITY_DIMENSIONS[dimKey]?.label || dimKey;

        suggestions.push({
          metric: fieldKey,
          dimension: dimKey,
          dimensionValue: groupValue,
          currentValue: round2(avgEstimated),
          suggestedValue,
          sampleSize: metrics.sampleSize,
          confidence,
          direction,
          magnitude,
          signedBias: round2(metrics.signedAvgError),
          mape: metrics.mape,
          reasoning: buildReasoning(
            `${field.label} for ${dimLabel}: ${groupValue}`,
            direction, magnitude, metrics, confidence
          ),
          supportingJobIds: jobIds,
        });
      }
    }
  }

  // Sort by confidence (strongest first) then magnitude
  const confOrder = { very_strong: 0, strong: 1, weak: 2 };
  suggestions.sort((a, b) =>
    (confOrder[a.confidence] || 3) - (confOrder[b.confidence] || 3) || b.magnitude - a.magnitude
  );

  return suggestions;
}

function buildReasoning(label, direction, magnitude, metrics, confidence) {
  const parts = [`${label} is consistently ${direction === 'increase' ? 'under' : 'over'}estimated`];
  parts.push(`by ~${magnitude.toFixed(0)}% on average`);
  parts.push(`(${metrics.sampleSize} jobs, ${confidence} confidence)`);
  if (metrics.mape !== null) {
    parts.push(`MAPE: ${(metrics.mape * 100).toFixed(0)}%`);
  }
  return parts.join('. ') + '.';
}

/**
 * Apply an accepted calibration to settings.
 * Returns a new settings object - does not mutate the original.
 */
export function applyCalibration(settings, calibrationRecord) {
  // For now, calibrations are informational recommendations.
  // The owner manually adjusts settings based on accepted calibrations.
  // This function provides a programmatic path for future use.
  const newSettings = { ...settings };

  const key = `${calibrationRecord.metric}:${calibrationRecord.dimension}`;
  const mapping = METRIC_TO_SETTING[key];
  if (mapping && calibrationRecord.approved_value != null) {
    // Deep-set the value at the mapped path
    newSettings[mapping.path] = calibrationRecord.approved_value;
  }

  return newSettings;
}

function round2(n) { return Math.round(n * 100) / 100; }
