import type { Recommendation } from './types';

export type DecisionLabRecord = {
  id: string;
  recommendation: Recommendation;
  confidence: number;
  suggestedPrice: { expected: number };
  contributionProfit: { expected: number };
  contributionPerLaborHour: { expected: number };
  contributionPerCapacityHour: number;
  riskFlags: string[];
  pricingFloors?: { binding: string };
  actualOutcome?: {
    actualLaborHours?: number;
    actualMaterialCost?: number;
    actualPrice?: number;
  } | null;
  humanAdjustment?: {
    adjustedPrice?: number;
    laborHoursAdjusted?: number;
    materialCostAdjusted?: number;
  } | null;
  laborHours?: { expected: number };
  materialCost?: { expected: number };
};

export type DecisionLabSummary = {
  totalRuns: number;
  recommendations: Record<Recommendation, number>;
  completedRuns: number;
  humanAdjustedRuns: number;
  medianConfidence: number;
  medianLaborError: number | null;
  medianMaterialError: number | null;
  topRiskFlags: { flag: string; count: number }[];
  pricingFloorDistribution: Record<string, number>;
  humanWinsLabor: number;
  humanWinsMaterial: number;
  rivetWinsLabor: number;
  rivetWinsMaterial: number;
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function summarizeDecisionLab(records: DecisionLabRecord[]): DecisionLabSummary {
  const recommendations: Record<Recommendation, number> = { take: 0, review: 0, pass: 0 };
  const laborErrors: number[] = [];
  const materialErrors: number[] = [];
  const confidences: number[] = [];
  const flagCounts: Record<string, number> = {};
  const floorCounts: Record<string, number> = {};
  let completedRuns = 0;
  let humanAdjustedRuns = 0;
  let humanWinsLabor = 0;
  let humanWinsMaterial = 0;
  let rivetWinsLabor = 0;
  let rivetWinsMaterial = 0;

  for (const r of records) {
    recommendations[r.recommendation] = (recommendations[r.recommendation] || 0) + 1;
    confidences.push(r.confidence);

    for (const flag of r.riskFlags) {
      flagCounts[flag] = (flagCounts[flag] || 0) + 1;
    }

    if (r.pricingFloors?.binding) {
      floorCounts[r.pricingFloors.binding] = (floorCounts[r.pricingFloors.binding] || 0) + 1;
    }

    const actual = r.actualOutcome;
    if (actual && actual.actualLaborHours != null) {
      completedRuns++;

      // Labor error: rivet estimate vs actual
      if (r.laborHours) {
        const rivetLaborError = Math.abs(r.laborHours.expected - actual.actualLaborHours);
        laborErrors.push(rivetLaborError);

        // Compare human vs rivet accuracy on labor
        if (r.humanAdjustment?.laborHoursAdjusted != null) {
          humanAdjustedRuns++;
          const humanLaborError = Math.abs(r.humanAdjustment.laborHoursAdjusted - actual.actualLaborHours);
          if (humanLaborError < rivetLaborError) humanWinsLabor++;
          else if (rivetLaborError < humanLaborError) rivetWinsLabor++;
        }
      }

      // Material error
      if (r.materialCost && actual.actualMaterialCost != null) {
        const rivetMatError = Math.abs(r.materialCost.expected - actual.actualMaterialCost);
        materialErrors.push(rivetMatError);

        if (r.humanAdjustment?.materialCostAdjusted != null) {
          const humanMatError = Math.abs(r.humanAdjustment.materialCostAdjusted - actual.actualMaterialCost);
          if (humanMatError < rivetMatError) humanWinsMaterial++;
          else if (rivetMatError < humanMatError) rivetWinsMaterial++;
        }
      }
    }
  }

  const topRiskFlags = Object.entries(flagCounts)
    .map(([flag, count]) => ({ flag, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalRuns: records.length,
    recommendations,
    completedRuns,
    humanAdjustedRuns,
    medianConfidence: median(confidences),
    medianLaborError: laborErrors.length > 0 ? median(laborErrors) : null,
    medianMaterialError: materialErrors.length > 0 ? median(materialErrors) : null,
    topRiskFlags,
    pricingFloorDistribution: floorCounts,
    humanWinsLabor,
    humanWinsMaterial,
    rivetWinsLabor,
    rivetWinsMaterial,
  };
}
