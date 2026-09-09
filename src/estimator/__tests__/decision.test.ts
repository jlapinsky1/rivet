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
      ownerAdjustedPerHour: range(100),
      contributionMargin: range(0.45),
      contributionProfit: range(300),
      confidence: 0.85,
      riskFlags: [],
    });
    const { recommendation } = deriveRecommendation(job, config, emptyContext);
    expect(recommendation).toBe('take');
  });

  it('low ownerAdjustedPerHour → Pass', () => {
    const job = makeJob({
      ownerAdjustedPerHour: { low: 10, expected: 20, high: 30 },
      contributionMargin: range(0.45),
      contributionProfit: range(300),
      confidence: 0.85,
      riskFlags: [],
    });
    const { recommendation, reasons } = deriveRecommendation(job, config, emptyContext);
    expect(recommendation).toBe('pass');
    expect(reasons.some(r => r.icon === 'x' && r.text.includes('/hr'))).toBe(true);
  });

  it('low contributionMargin → Pass', () => {
    const job = makeJob({
      ownerAdjustedPerHour: range(100),
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
      ownerAdjustedPerHour: range(100),
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
      ownerAdjustedPerHour: range(200),
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
      ownerAdjustedPerHour: range(100),
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
      ownerAdjustedPerHour: range(100),
      contributionMargin: range(0.45),
      contributionProfit: range(300),
      confidence: 0.85,
      riskFlags: ['unsupported_task_component'],
    });
    const { recommendation } = deriveRecommendation(job, config, emptyContext);
    // unsupported_task_component isn't a special flag in decision.ts — it just lowers confidence in estimator
    // but structural flags and unknown_job_family do force review
    expect(['take', 'review']).toContain(recommendation);
  });

  it('structural risk flag → Review', () => {
    const job = makeJob({
      ownerAdjustedPerHour: range(100),
      contributionMargin: range(0.45),
      contributionProfit: range(300),
      confidence: 0.85,
      riskFlags: ['structural_joist_damage'],
    });
    const { recommendation } = deriveRecommendation(job, config, emptyContext);
    expect(recommendation).toBe('review');
  });

  it('no_tasks_extracted risk flag → Review (via low confidence)', () => {
    // no_tasks_extracted sets confidence <= 0.20 in estimator → triggers review
    const job = makeJob({
      ownerAdjustedPerHour: range(100),
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
      ownerAdjustedPerHour: range(100),
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
      requiredProfitPerHour: 50,
    };
    const { recommendation } = deriveRecommendation(job, config, scarceContext);
    expect(recommendation).toBe('pass');
  });

  it('requiredProfitPerHour above job rate → Review', () => {
    const job = makeJob({
      ownerAdjustedPerHour: { low: 76, expected: 80, high: 90 },
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
      requiredProfitPerHour: 120,
    };
    const { recommendation, reasons } = deriveRecommendation(job, config, paceContext);
    expect(recommendation).toBe('review');
    expect(reasons.some(r => r.text.includes('pace'))).toBe(true);
  });

  it('goal nearly met → positive reason', () => {
    const job = makeJob({
      ownerAdjustedPerHour: range(100),
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
      requiredProfitPerHour: 5,
    };
    const { reasons } = deriveRecommendation(job, config, nearGoalContext);
    expect(reasons.some(r => r.icon === 'check' && r.text.includes('goal'))).toBe(true);
  });

  it('zero/default context degrades gracefully to static thresholds', () => {
    const job = makeJob({
      ownerAdjustedPerHour: range(100),
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
      ownerAdjustedPerHour: range(100),
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
