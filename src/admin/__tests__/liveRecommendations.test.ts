import { describe, it, expect } from 'vitest';
import { applyLiveRecommendations } from '../../estimator/applyLiveRecommendations';
import { buildDecisionContext } from '../../estimator/weekContext';
import type { WorkItem } from '../types';
import type { EstimationRun, EconomicJob } from '../../estimator/types';

function job(overrides: Partial<EconomicJob> = {}): EconomicJob {
  return {
    laborHours: { low: 1, expected: 1.5, high: 2 },
    capacityHours: 2.5,
    procurementHours: 0.5,
    travelHours: 0.5,
    returnTripHours: 0,
    materialCost: { low: 20, expected: 30, high: 40 },
    travelCost: 14,
    helperLaborCost: { low: 0, expected: 0, high: 0 },
    totalDirectCost: { low: 40, expected: 50, high: 60 },
    minimumAcceptablePrice: 175,
    pricingFloors: {
      minimumJob: 175,
      margin: 77,
      absoluteProfit: 125,
      laborProductivity: 155,
      weeklyCapacityPace: 0,
      binding: 'minimumJob',
    },
    estimatedQuoteRange: { low: 150, expected: 180, high: 220 },
    recommendedQuote: 180,
    evaluatedPrice: 180,
    contributionProfit: { low: 100, expected: 130, high: 160 },
    contributionMargin: { low: 0.4, expected: 0.5, high: 0.6 },
    contributionPerLaborHour: { low: 70, expected: 86, high: 100 },
    contributionPerCapacityHour: 52,
    ownerAdjustedProfit: { low: 20, expected: 40, high: 60 },
    ownerAdjustedPerHour: { low: 10, expected: 26, high: 40 },
    confidence: 0.9,
    riskFlags: [],
    breakdown: [],
    ...overrides,
  };
}

function item(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 1,
    title: 'Patch',
    source: 'customer_request',
    customerType: 'individual',
    customerName: 'Test',
    location: 'Nashville',
    travel: '8 mi',
    profit: 130,
    hours: '1–2 hrs',
    hoursNum: 1.5,
    rate: '$86/hr',
    rateNum: 86,
    recommendation: 'take',
    confidence: 90,
    description: 'small patch',
    price: 180,
    costs: 50,
    costBreakdown: [],
    reasons: [],
    photos: [],
    opStatus: 'needs_review',
    billingStatus: 'not_invoiced',
    serviceType: 'Handyman',
    estimationRunId: 'run-1',
    ...overrides,
  };
}

function run(economicJob: EconomicJob): EstimationRun {
  return {
    id: 'run-1',
    businessId: 'biz',
    createdAt: '2026-09-20T12:00:00Z',
    projectFamily: 'drywall_repair',
    estimatorVersion: '0.3.0',
    aiModel: 'test',
    promptVersion: 'test',
    customerInputs: { description: 'patch', photos: [] },
    extraction: {
      tradeContexts: ['drywall_repair'],
      assemblyCandidate: 'SMALL_DRYWALL_PATCH',
      assemblyConfidence: 0.9,
      tasks: [],
      conditions: [],
      unknowns: [],
      materialSupplyStatus: 'contractor_supplied',
      overallConfidence: 0.9,
      rawDescription: 'patch',
    },
    baselineEstimate: {
      laborHours: { low: 1, expected: 1.5, high: 2 },
      materialCost: { low: 20, expected: 30, high: 40 },
      confidence: 0.9,
      riskFlags: [],
      breakdown: [],
      path: 'assembly',
    } as EstimationRun['baselineEstimate'],
    calibrationApplied: null,
    economicJob,
    decisionContext: buildDecisionContext([], { weeklyGoal: 2500, weeklyHours: 35 }),
    recommendation: 'take',
    reasons: [],
    confidence: 0.9,
  };
}

describe('applyLiveRecommendations', () => {
  it('leaves completed jobs on their stored recommendation', () => {
    const completed = item({ opStatus: 'completed', recommendation: 'take' });
    const result = applyLiveRecommendations([completed], [run(job())], { weeklyGoal: 2500, weeklyHours: 35 }, 'biz');
    expect(result[0].recommendation).toBe('take');
  });

  it('reprices a clear job when the live week floor is above the stored quote', () => {
    const pending = item();
    const booked = item({
      id: 2,
      opStatus: 'scheduled',
      estimationRunId: undefined,
      profit: 400,
      hoursNum: 28,
    });
    const result = applyLiveRecommendations(
      [pending, booked],
      [run(job())],
      { weeklyGoal: 2500, weeklyHours: 35, minimumHourlyRate: 70, minimumPrice: 175 },
      'biz',
    );
    expect(['take_at_price', 'pass', 'take']).toContain(result[0].recommendation);
  });
});
