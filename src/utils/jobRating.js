/**
 * Configurable thresholds for job rating.
 * Each dimension scores 1–4 (poor–excellent).
 */
export const RATING_THRESHOLDS = {
  margin: { excellent: 0.80, good: 0.70, marginal: 0.55 },
  profit: { excellent: 300, good: 150, marginal: 75 },
  travelMinutes: { excellent: 30, good: 60, marginal: 90 },
  onSiteHours: { excellent: 1, good: 2, marginal: 3.5 },
  truckVolumePct: { excellent: 60, good: 30, marginal: 15 },
};

const WEIGHTS = {
  margin: 0.30,
  profit: 0.20,
  travel: 0.10,
  duration: 0.10,
  truckUtilization: 0.15,
  confidence: 0.15,
};

const CONFIDENCE_SCORES = { high: 4, medium: 2.5, low: 1 };

function scoreHigherIsBetter(value, thresholds) {
  if (value >= thresholds.excellent) return 4;
  if (value >= thresholds.good) return 3;
  if (value >= thresholds.marginal) return 2;
  return 1;
}

function scoreLowerIsBetter(value, thresholds) {
  if (value <= thresholds.excellent) return 4;
  if (value <= thresholds.good) return 3;
  if (value <= thresholds.marginal) return 2;
  return 1;
}

/**
 * Rate a job based on estimate data and confidence.
 * Returns { rating, score (0-100), reasons, dimensions }.
 */
export function rateJob(estimate, confidence) {
  const t = RATING_THRESHOLDS;
  const reasons = [];

  const marginScore = scoreHigherIsBetter(estimate.estimatedMargin, t.margin);
  const profitScore = scoreHigherIsBetter(estimate.estimatedProfit, t.profit);
  const travelScore = scoreLowerIsBetter(estimate.estimatedTravelMinutes, t.travelMinutes);
  const durationScore = scoreLowerIsBetter(estimate.estimatedOnSiteHours, t.onSiteHours);
  const truckScore = scoreHigherIsBetter(estimate.estimatedVolumePct ?? 50, t.truckVolumePct);
  const confidenceScore = CONFIDENCE_SCORES[confidence?.level] ?? 1;

  if (marginScore >= 4) reasons.push('Excellent margin');
  else if (marginScore <= 1) reasons.push('Low margin - review pricing');

  if (profitScore >= 4) reasons.push('High profit potential');
  else if (profitScore <= 1) reasons.push('Low profit - consider raising price');

  if (travelScore <= 1) reasons.push('Long travel distance');
  if (durationScore <= 1) reasons.push('Lengthy job - verify estimate');

  if (truckScore >= 4) reasons.push('Good truck utilization');
  else if (truckScore <= 1) reasons.push('Low truck utilization for the trip');

  if (confidenceScore <= 1) reasons.push('Low confidence - manual review needed');

  const weighted =
    marginScore * WEIGHTS.margin +
    profitScore * WEIGHTS.profit +
    travelScore * WEIGHTS.travel +
    durationScore * WEIGHTS.duration +
    truckScore * WEIGHTS.truckUtilization +
    confidenceScore * WEIGHTS.confidence;

  let rating;
  if (weighted >= 3.2) rating = 'excellent';
  else if (weighted >= 2.5) rating = 'good';
  else if (weighted >= 1.8) rating = 'marginal';
  else rating = 'poor';

  return {
    rating,
    score: Math.round(weighted * 25),
    reasons,
    dimensions: {
      margin: marginScore,
      profit: profitScore,
      travel: travelScore,
      duration: durationScore,
      truckUtilization: truckScore,
      confidence: confidenceScore,
    },
  };
}

export const RATING_COLORS = {
  excellent: 'bg-green-100 border-green-500 text-green-800',
  good: 'bg-blue-100 border-blue-500 text-blue-800',
  marginal: 'bg-yellow-100 border-yellow-500 text-yellow-800',
  poor: 'bg-red-100 border-red-500 text-red-800',
};

export const RATING_LABELS = {
  excellent: 'Excellent',
  good: 'Good',
  marginal: 'Marginal',
  poor: 'Poor',
};

export const CONFIDENCE_COLORS = {
  high: 'text-green-700 bg-green-50',
  medium: 'text-yellow-700 bg-yellow-50',
  low: 'text-red-700 bg-red-50',
};
