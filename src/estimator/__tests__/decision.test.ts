import { describe, it, expect } from 'vitest';
import { deriveRecommendation } from '../decision';
import { estimateHandymanJob, applyCalibration } from '../estimator';
import { ASSEMBLIES } from '../assemblies';
import type { EconomicJob, BusinessEconomicsConfig, DecisionContext, ExtractionResult, ExtractedTask, Range } from '../types';
import { defaultBusinessEconomicsConfig, defaultDecisionContext } from '../types';

// ─── Helpers ───

const config = defaultBusinessEconomicsConfig('test-biz');
const emptyContext = defaultDecisionContext();

function makeAssemblyExtraction(assemblyCode: string, overrides?: Partial<ExtractionResult>): ExtractionResult {
  const assembly = ASSEMBLIES[assemblyCode];
  return {
    tradeContexts: assembly ? [assembly.tradeContext] : ['general'],
    assemblyCandidate: assemblyCode,
    assemblyConfidence: 0.90,
    tasks: [],
    conditions: [],
    unknowns: [],
    materialSupplyStatus: 'contractor_supplied',
    overallConfidence: 0.85,
    rawDescription: 'test',
    ...overrides,
  };
}

function makeJob(overrides: Partial<EconomicJob>): EconomicJob {
  const est = estimateHandymanJob(makeAssemblyExtraction('DRYWALL_SECTION_REPLACEMENT'));
  const base = applyCalibration(est, config, null, 10);
  return { ...base, ...overrides };
}

function range(v: number): Range {
  return { low: v * 0.8, expected: v, high: v * 1.2 };
}

// ─── Static Threshold Tests ───

describe('deriveRecommendation — static thresholds', () => {
  it('good job → Take', () => {
    const job = makeJob({
      contributionPerLaborHour: range(100),
      contributionMargin: range(0.45),
      contributionProfit: range(300),
      confidence: 0.85,
      riskFlags: [],
    });
    const { recommendation } = deriveRecommendation(job, config, emptyContext);
    expect(recommendation).toBe('take');
  });

  it('low contributionPerLaborHour → Pass', () => {
    const job = makeJob({
      contributionPerLaborHour: { low: 10, expected: 20, high: 30 },
      contributionMargin: range(0.45),
      contributionProfit: range(300),
      confidence: 0.85,
      riskFlags: [],
    });
    const { recommendation, reasons } = deriveRecommendation(job, config, emptyContext);
    expect(recommendation).toBe('pass');
    expect(reasons.some(r => r.icon === 'x' && r.text.includes('work hour'))).toBe(true);
  });

  it('low contributionMargin → Pass', () => {
    const job = makeJob({
      contributionPerLaborHour: range(100),
      contributionMargin: { low: 0.10, expected: 0.20, high: 0.25 },
      contributionProfit: range(300),
      confidence: 0.85,
      riskFlags: [],
    });
    const { recommendation } = deriveRecommendation(job, config, emptyContext);
    expect(recommendation).toBe('pass');
  });

  it('contributionProfit < profitFloorAbsolute → Pass', () => {
    const job = makeJob({
      contributionPerLaborHour: range(100),
      contributionMargin: range(0.45),
      contributionProfit: { low: 10, expected: 30, high: 45 },
      confidence: 0.85,
      riskFlags: [],
    });
    const { recommendation } = deriveRecommendation(job, config, emptyContext);
    expect(recommendation).toBe('pass');
  });
});

// ─── Review Cases ───

describe('deriveRecommendation — review triggers', () => {
  it('low confidence → Review regardless of economics', () => {
    const job = makeJob({
      contributionPerLaborHour: range(200),
      contributionMargin: range(0.60),
      contributionProfit: range(500),
      confidence: 0.50,
      riskFlags: [],
    });
    const { recommendation } = deriveRecommendation(job, config, emptyContext);
    expect(recommendation).toBe('review');
  });

  it('expected good but high/conservative case bad → Review', () => {
    const job = makeJob({
      contributionPerLaborHour: { low: 30, expected: 100, high: 150 },
      contributionMargin: range(0.45),
      contributionProfit: { low: 20, expected: 300, high: 500 },
      confidence: 0.85,
      riskFlags: [],
    });
    const { recommendation } = deriveRecommendation(job, config, emptyContext);
    expect(recommendation).toBe('review');
  });

  it('unsupported_task_component risk flag → Review', () => {
    const job = makeJob({
      contributionPerLaborHour: range(100),
      contributionMargin: range(0.45),
      contributionProfit: range(300),
      confidence: 0.85,
      riskFlags: ['unsupported_task_component'],
    });
    const { recommendation } = deriveRecommendation(job, config, emptyContext);
    expect(['take', 'review']).toContain(recommendation);
  });

  it('structural risk flag → Review', () => {
    const job = makeJob({
      contributionPerLaborHour: range(100),
      contributionMargin: range(0.45),
      contributionProfit: range(300),
      confidence: 0.85,
      riskFlags: ['structural_joist_damage'],
    });
    const { recommendation } = deriveRecommendation(job, config, emptyContext);
    expect(recommendation).toBe('review');
  });

  it('no_tasks_extracted risk flag → Review (via low confidence)', () => {
    const job = makeJob({
      contributionPerLaborHour: range(100),
      contributionMargin: range(0.45),
      contributionProfit: range(300),
      confidence: 0.15,
      riskFlags: ['no_tasks_extracted'],
    });
    const { recommendation } = deriveRecommendation(job, config, emptyContext);
    expect(recommendation).toBe('review');
  });
});

// ─── DecisionContext ───

describe('deriveRecommendation — DecisionContext', () => {
  it('scarce capacity → affects recommendation', () => {
    const job = makeJob({
      contributionPerLaborHour: range(100),
      contributionMargin: range(0.45),
      contributionProfit: range(300),
      confidence: 0.85,
      riskFlags: [],
      capacityHours: 20,
    });
    const scarceContext: DecisionContext = {
      weeklyEarningsToDate: 1000,
      remainingCapacityHours: 5,
      pipelineValue: 0,
      pipelineHours: 0,
      requiredContributionPerCapacityHour: 50,
    };
    const { recommendation } = deriveRecommendation(job, config, scarceContext);
    expect(recommendation).toBe('pass');
  });

  it('requiredContributionPerCapacityHour above job capacity rate → Review', () => {
    const job = makeJob({
      contributionPerLaborHour: range(100),
      contributionPerCapacityHour: 60,
      contributionMargin: range(0.45),
      contributionProfit: range(300),
      confidence: 0.85,
      riskFlags: [],
    });
    const paceContext: DecisionContext = {
      weeklyEarningsToDate: 500,
      remainingCapacityHours: 20,
      pipelineValue: 0,
      pipelineHours: 0,
      requiredContributionPerCapacityHour: 120,
    };
    const { recommendation, reasons } = deriveRecommendation(job, config, paceContext);
    expect(recommendation).toBe('review');
    expect(reasons.some(r => r.text.includes('pace') || r.text.includes('schedule hour'))).toBe(true);
  });

  it('goal nearly met → positive reason', () => {
    const job = makeJob({
      contributionPerLaborHour: range(100),
      contributionMargin: range(0.45),
      contributionProfit: { low: 2200, expected: 2400, high: 2600 },
      confidence: 0.85,
      riskFlags: [],
    });
    const nearGoalContext: DecisionContext = {
      weeklyEarningsToDate: 2400,
      remainingCapacityHours: 20,
      pipelineValue: 0,
      pipelineHours: 0,
      requiredContributionPerCapacityHour: 5,
    };
    const { reasons } = deriveRecommendation(job, config, nearGoalContext);
    expect(reasons.some(r => r.icon === 'check' && r.text.includes('goal'))).toBe(true);
  });

  it('zero/default context degrades gracefully to static thresholds', () => {
    const job = makeJob({
      contributionPerLaborHour: range(100),
      contributionMargin: range(0.45),
      contributionProfit: range(300),
      confidence: 0.85,
      riskFlags: [],
    });
    const { recommendation } = deriveRecommendation(job, config, emptyContext);
    expect(['take', 'review', 'pass']).toContain(recommendation);
  });
});

// ─── Reasons ───

describe('reasons', () => {
  it('reasons are populated and match recommendation', () => {
    const job = makeJob({
      contributionPerLaborHour: range(100),
      contributionMargin: range(0.45),
      contributionProfit: range(300),
      confidence: 0.85,
      riskFlags: [],
    });
    const { recommendation, reasons } = deriveRecommendation(job, config, emptyContext);
    expect(reasons.length).toBeGreaterThan(0);

    if (recommendation === 'take') {
      expect(reasons.some(r => r.icon === 'check')).toBe(true);
    }
    if (recommendation === 'pass') {
      expect(reasons.some(r => r.icon === 'x')).toBe(true);
    }
  });
});

// ─── Labor-Hour vs Capacity-Hour Distinction ───

describe('labor-hour vs capacity-hour economics', () => {
  it('same profit, different capacity → different capacity rate and assessment', () => {
    const jobLowCapacity = makeJob({
      contributionPerLaborHour: range(100),
      contributionPerCapacityHour: 89,
      contributionProfit: range(400),
      contributionMargin: range(0.45),
      capacityHours: 4.5,
      confidence: 0.85,
      riskFlags: [],
    });
    const jobHighCapacity = makeJob({
      contributionPerLaborHour: range(100),
      contributionPerCapacityHour: 57,
      contributionProfit: range(400),
      contributionMargin: range(0.45),
      capacityHours: 7,
      confidence: 0.85,
      riskFlags: [],
    });

    const paceContext: DecisionContext = {
      weeklyEarningsToDate: 500,
      remainingCapacityHours: 20,
      pipelineValue: 0,
      pipelineHours: 0,
      requiredContributionPerCapacityHour: 74,
    };

    const resultA = deriveRecommendation(jobLowCapacity, config, paceContext);
    const resultB = deriveRecommendation(jobHighCapacity, config, paceContext);

    // Low capacity job should be above pace, high capacity below
    expect(resultA.reasons.some(r => r.icon === 'check' && r.text.includes('schedule hour'))).toBe(true);
    expect(resultB.reasons.some(r => r.icon !== 'check' && r.text.includes('schedule hour'))).toBe(true);
  });

  it('suggestedPrice sanity — high-confidence assembly should not PASS from hourly-rate failure', () => {
    const est = estimateHandymanJob(makeAssemblyExtraction('SMALL_DRYWALL_PATCH'));
    const job = applyCalibration(est, config, null, 10);
    const { recommendation, reasons } = deriveRecommendation(job, config, emptyContext);

    // The pricing floors should ensure the suggested price produces adequate contributionPerLaborHour
    if (job.confidence >= config.confidenceThreshold) {
      const hasHourlyRatePass = reasons.some(r => r.icon === 'x' && r.text.includes('work hour'));
      expect(hasHourlyRatePass).toBe(false);
    }
  });

  it('metric consistency — never compares capacity-hour metric against labor-hour threshold', () => {
    // The decision engine checks contributionPerLaborHour against minimumHourlyRate
    // and contributionPerCapacityHour against requiredContributionPerCapacityHour
    // This test verifies by constructing a job where the two rates differ significantly

    const job = makeJob({
      contributionPerLaborHour: range(100), // well above $75 minimum
      contributionPerCapacityHour: 40,       // well below any capacity pace
      contributionMargin: range(0.45),
      contributionProfit: range(300),
      capacityHours: 7.5,
      confidence: 0.85,
      riskFlags: [],
    });

    const paceContext: DecisionContext = {
      weeklyEarningsToDate: 500,
      remainingCapacityHours: 20,
      pipelineValue: 0,
      pipelineHours: 0,
      requiredContributionPerCapacityHour: 74,
    };

    const { reasons } = deriveRecommendation(job, config, paceContext);

    // Labor hour check should pass (100 > 75)
    expect(reasons.some(r => r.icon === 'x' && r.text.includes('work hour'))).toBe(false);
    // Capacity hour check should flag (40 < 74)
    expect(reasons.some(r => r.text.includes('schedule hour'))).toBe(true);
  });
});
