import { calculateActuals } from './completion.js';

/**
 * Fields we track for variance analysis.
 * Each maps to an extractor that pulls estimated and actual values from a booking.
 */
export const VARIANCE_FIELDS = {
  price: {
    label: 'Price',
    unit: '$',
    extract(booking) {
      const est = booking.internal_estimate;
      const act = booking.actuals;
      if (!est || !act || act.finalAmount == null) return null;
      return { estimated: est.recommendedPrice || 0, actual: Number(act.finalAmount) };
    },
  },
  cashProfit: {
    label: 'Cash Profit',
    unit: '$',
    extract(booking) {
      const est = booking.internal_estimate;
      const act = booking.actuals;
      if (!est || !act || act.finalAmount == null) return null;
      const computed = calculateActuals(act, null);
      return { estimated: est.estimatedProfit || 0, actual: computed.cashProfit };
    },
  },
  margin: {
    label: 'Margin',
    unit: '%',
    extract(booking) {
      const est = booking.internal_estimate;
      const act = booking.actuals;
      if (!est || !act || act.finalAmount == null) return null;
      const computed = calculateActuals(act, null);
      return { estimated: (est.estimatedMargin || 0) * 100, actual: computed.cashMargin * 100 };
    },
  },
  travelMinutes: {
    label: 'Travel Time',
    unit: 'min',
    minDenominator: 5,
    extract(booking) {
      const est = booking.internal_estimate;
      const act = booking.actuals;
      if (!est || !act || act.actualTravelMinutes == null || est.estimatedTravelMinutes == null) return null;
      return { estimated: est.estimatedTravelMinutes, actual: Number(act.actualTravelMinutes) };
    },
  },
  onSiteMinutes: {
    label: 'On-Site Time',
    unit: 'min',
    minDenominator: 5,
    extract(booking) {
      const est = booking.internal_estimate;
      const act = booking.actuals;
      if (!est || !act || act.actualOnSiteMinutes == null || est.estimatedOnSiteHours == null) return null;
      return { estimated: est.estimatedOnSiteHours * 60, actual: Number(act.actualOnSiteMinutes) };
    },
  },
  truckVolumePct: {
    label: 'Truck Volume',
    unit: '%',
    extract(booking) {
      const est = booking.internal_estimate;
      const act = booking.actuals;
      if (!est || !act || act.actualTruckVolumePct == null || est.estimatedVolumePct == null) return null;
      return { estimated: est.estimatedVolumePct, actual: Number(act.actualTruckVolumePct) };
    },
  },
  disposalCost: {
    label: 'Disposal Cost',
    unit: '$',
    minDenominator: 10,
    extract(booking) {
      const est = booking.internal_estimate;
      const act = booking.actuals;
      if (!est || !act || act.disposalCost == null || est.disposalAllowance == null) return null;
      return { estimated: est.disposalAllowance, actual: Number(act.disposalCost) };
    },
  },
};

/**
 * Compute variance metrics for an array of { estimated, actual } pairs.
 * Guards against zero/small denominators for percentage-based metrics.
 */
export function computeMetrics(pairs, minDenominator = 10) {
  if (!pairs.length) return null;

  const errors = pairs.map(p => p.actual - p.estimated);
  const absErrors = errors.map(Math.abs);
  const n = pairs.length;

  const avgError = errors.reduce((s, e) => s + e, 0) / n;
  const absAvgError = absErrors.reduce((s, e) => s + e, 0) / n;

  // Median
  const sorted = [...errors].sort((a, b) => a - b);
  const medianError = n % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];

  // MAPE - skip pairs with small denominators
  const validForPct = pairs.filter(p => Math.abs(p.estimated) >= minDenominator);
  const mape = validForPct.length > 0
    ? validForPct.reduce((s, p) => s + Math.abs(p.actual - p.estimated) / Math.abs(p.estimated), 0) / validForPct.length
    : null;

  // Signed average error (directional bias)
  const signedAvgError = avgError;

  // Over/under estimate rates
  const overCount = errors.filter(e => e < 0).length; // actual < estimated → overestimate
  const underCount = errors.filter(e => e > 0).length; // actual > estimated → underestimate
  const overestimateRate = overCount / n;
  const underestimateRate = underCount / n;

  return {
    sampleSize: n,
    avgError: round2(avgError),
    absAvgError: round2(absAvgError),
    medianError: round2(medianError),
    signedAvgError: round2(signedAvgError),
    mape: mape !== null ? round4(mape) : null,
    overestimateRate: round2(overestimateRate),
    underestimateRate: round2(underestimateRate),
  };
}

/**
 * Aggregate variance metrics across all completed bookings for each field.
 */
export function aggregateVarianceMetrics(completedBookings) {
  const results = {};

  for (const [fieldKey, field] of Object.entries(VARIANCE_FIELDS)) {
    const pairs = [];
    for (const booking of completedBookings) {
      const pair = field.extract(booking);
      if (pair) pairs.push(pair);
    }
    results[fieldKey] = computeMetrics(pairs, field.minDenominator || 10);
  }

  return results;
}

/**
 * Compute single-job variance for all fields.
 */
export function computeJobVariance(booking) {
  const results = {};
  for (const [fieldKey, field] of Object.entries(VARIANCE_FIELDS)) {
    const pair = field.extract(booking);
    if (pair) {
      results[fieldKey] = {
        estimated: pair.estimated,
        actual: pair.actual,
        error: round2(pair.actual - pair.estimated),
        signedError: round2(pair.actual - pair.estimated),
        pctError: Math.abs(pair.estimated) >= (field.minDenominator || 10)
          ? round4(Math.abs(pair.actual - pair.estimated) / Math.abs(pair.estimated))
          : null,
      };
    }
  }
  return results;
}

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }
