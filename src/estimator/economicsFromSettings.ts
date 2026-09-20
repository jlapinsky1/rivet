import type { BusinessEconomicsConfig } from './types';

export function economicsFromSettings(
  settings: Record<string, unknown> | null | undefined,
  businessId: string,
): BusinessEconomicsConfig {
  const s = settings || {};
  return {
    businessId,
    ownerOpportunityRatePerHour: num(s.ownerOpportunityRate, 75),
    helperCashRatePerHour: num(s.helperRate, 30),
    mileageRate: num(s.mileageRate, 0.70),
    materialMarkupPercent: num(s.materialMarkup, 20),
    minimumJobPrice: num(s.minimumPrice, 175),
    minimumHourlyRate: num(s.minimumHourlyRate, 70),
    profitFloorAbsolute: num(s.minimumJobProfit, 75),
    marginFloorPercent: num(s.minimumMargin, 35) > 1 ? num(s.minimumMargin, 35) : 35,
    confidenceThreshold: num(s.confidenceThreshold, 0.70),
    weeklyEarningsGoal: num(s.weeklyGoal, 2500),
    weeklyCapacityHours: num(s.weeklyHours, 35),
  };
}

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
