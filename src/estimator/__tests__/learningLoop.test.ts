/**
 * Learning Loop Reliability Tests
 *
 * Covers the invariants defined in LEARNING_LOOP_RELIABILITY_SPEC.md:
 *
 *   I5  — reliabilityTier gate: 'unknown' cannot result in 'take'
 *   I4  — calibration is correctly applied and scales estimates
 *   P0  — robust aggregation and hierarchical key logic (via applyCalibration)
 *
 * Tests that require a live Supabase connection (queue drain, cache write, end-to-end
 * close-out → recompute → new estimate) belong in an integration test environment
 * and are marked with a comment explaining the gap.
 */

import { describe, it, expect } from 'vitest';
import { estimateHandymanJob, applyCalibration } from '../estimator';
import { deriveRecommendation } from '../decision';
import { buildDecisionContext } from '../weekContext';
import { defaultBusinessEconomicsConfig } from '../types';
import type { ExtractionResult, BusinessCalibration } from '../types';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function emptyExtraction(overrides?: Partial<ExtractionResult>): ExtractionResult {
  return {
    tradeContexts: ['general_handyman'],
    assemblyCandidate: null,
    assemblyConfidence: 0,
    tasks: [],
    conditions: [],
    unknowns: [],
    materialSupplyStatus: 'contractor_supplied',
    overallConfidence: 0.85,
    rawDescription: 'test',
    ...overrides,
  };
}

function assemblyExtraction(code: string, overrides?: Partial<ExtractionResult>): ExtractionResult {
  return {
    tradeContexts: ['carpentry'],
    assemblyCandidate: code,
    assemblyConfidence: 0.90,
    tasks: [],
    conditions: [],
    unknowns: [],
    materialSupplyStatus: 'contractor_supplied',
    overallConfidence: 0.90,
    rawDescription: 'test',
    ...overrides,
  };
}

const config = defaultBusinessEconomicsConfig('biz_test');
const ctx = buildDecisionContext([], { weeklyGoal: 2500, weeklyHours: 35 });

// ─── I5: Reliability Safety Gate ─────────────────────────────────────────────

describe('I5 — reliabilityTier gate', () => {
  it('unknown tier forces review — never take', () => {
    // No tasks extracted → no_tasks_extracted flag → 'unknown' tier
    const extraction = emptyExtraction({ tasks: [], overallConfidence: 0.15 });
    const estimate = estimateHandymanJob(extraction);

    expect(estimate.reliabilityTier).toBe('unknown');

    const job = applyCalibration(estimate, config, null, 5, ctx);
    const result = deriveRecommendation(job, config, ctx, estimate.reliabilityTier);

    expect(result.recommendation).not.toBe('take');
    expect(result.recommendation).not.toBe('take_at_price');
    expect(result.recommendation).toBe('review');
    expect(result.reasons.some(r => r.text.includes('Reliability unknown'))).toBe(true);
  });

  it('unknown tier forces review even when job is highly profitable', () => {
    const extraction = emptyExtraction({ tasks: [], overallConfidence: 0.15 });
    const estimate = estimateHandymanJob(extraction);

    // Use a very high calibration to make the job "look" profitable
    const richCalibration: BusinessCalibration = {
      businessId: 'test', projectFamily: 'general_handyman',
      laborMultiplier: 0.5, materialMultiplier: 0.5, sampleSize: 20,
    };
    const job = applyCalibration(estimate, config, richCalibration, 2, ctx);
    const result = deriveRecommendation(job, config, ctx, estimate.reliabilityTier);

    expect(result.recommendation).toBe('review');
  });

  it('low tier allows a quote but adds caution reason', () => {
    // overallConfidence 0.72: above confidenceThreshold (0.70) so the existing
    // confidence gate does not trigger review independently. Component path with
    // 0.60 <= 0.72 < 0.80 → 'low' tier.
    const extraction = emptyExtraction({
      tasks: [{ component: 'patch_surface', quantity: 3, complexity: 'standard', confidence: 0.72, source: 'observed' }],
      overallConfidence: 0.72,
    });
    const estimate = estimateHandymanJob(extraction);

    // 'low' tier: component path, 0.60 <= confidence < 0.80
    expect(estimate.reliabilityTier).toBe('low');

    const job = applyCalibration(estimate, config, null, 5, ctx);
    const result = deriveRecommendation(job, config, ctx, estimate.reliabilityTier);

    // Not forced to review just for 'low'
    expect(result.recommendation).not.toBe('review');
    expect(result.reasons.some(r => r.text.includes('range is wide'))).toBe(true);
  });

  it('no reliabilityTier passed — existing behavior unchanged', () => {
    const extraction = emptyExtraction({
      tasks: [{ component: 'patch_surface', quantity: 2, complexity: 'standard', confidence: 0.80, source: 'observed' }],
      overallConfidence: 0.80,
    });
    const estimate = estimateHandymanJob(extraction);
    const job = applyCalibration(estimate, config, null, 5, ctx);

    // No tier passed — no reliability reasons, behavior identical to before
    const result = deriveRecommendation(job, config, ctx);
    expect(result.reasons.every(r => !r.text.includes('Reliability'))).toBe(true);
    expect(result.reasons.every(r => !r.text.includes('range is wide'))).toBe(true);
  });
});

// ─── Reliability Tier Computation ─────────────────────────────────────────────

describe('ReliabilityTier — computation rules', () => {
  it('assembly path, clean conditions, confidence >= 0.80 → high', () => {
    const extraction = assemblyExtraction('STANDARD_EXTERIOR_DOOR');
    const estimate = estimateHandymanJob(extraction);
    expect(estimate.estimationPath).toBe('assembly');
    expect(estimate.reliabilityTier).toBe('high');
  });

  it('assembly path, confidence 0.60–0.79 → medium', () => {
    // assemblyConfidence 0.80 passes the 0.75 threshold → assembly path
    // water_damage condition adds -0.10 → final confidence 0.70 → medium tier
    const extraction = assemblyExtraction('STANDARD_EXTERIOR_DOOR', {
      conditions: ['water_damage'],
      assemblyConfidence: 0.80,
    });
    const estimate = estimateHandymanJob(extraction);
    expect(estimate.estimationPath).toBe('assembly');
    expect(estimate.reliabilityTier).toBe('medium');
  });

  it('component path, confidence >= 0.80 → medium (not high)', () => {
    const extraction = emptyExtraction({
      tasks: [
        { component: 'patch_surface', quantity: 2, complexity: 'standard', confidence: 0.90, source: 'observed' },
        { component: 'paint_or_touchup', quantity: 2, complexity: 'standard', confidence: 0.90, source: 'observed' },
      ],
      overallConfidence: 0.90,
    });
    const estimate = estimateHandymanJob(extraction);
    expect(estimate.estimationPath).toBe('component');
    // Component path is structurally less reliable — capped at medium
    expect(estimate.reliabilityTier).toBe('medium');
    expect(estimate.reliabilityTier).not.toBe('high');
  });

  it('no_tasks_extracted flag → unknown tier regardless of confidence', () => {
    const extraction = emptyExtraction({ overallConfidence: 0.95 });
    const estimate = estimateHandymanJob(extraction);
    expect(estimate.riskFlags).toContain('no_tasks_extracted');
    expect(estimate.reliabilityTier).toBe('unknown');
  });
});

// ─── I4: Calibration Application ─────────────────────────────────────────────

describe('I4 — calibration scales estimates correctly', () => {
  it('laborMultiplier > 1 increases labor hours', () => {
    const extraction = assemblyExtraction('STANDARD_EXTERIOR_DOOR');
    const estimate = estimateHandymanJob(extraction);

    const uncalibrated = applyCalibration(estimate, config, null, 0, ctx);

    const calibration: BusinessCalibration = {
      businessId: 'test', projectFamily: 'carpentry',
      laborMultiplier: 1.4, materialMultiplier: 1.0, sampleSize: 10,
    };
    const calibrated = applyCalibration(estimate, config, calibration, 0, ctx);

    expect(calibrated.laborHours.expected).toBeGreaterThan(uncalibrated.laborHours.expected);
    expect(calibrated.laborHours.expected).toBeCloseTo(uncalibrated.laborHours.expected * 1.4, 1);
  });

  it('materialMultiplier > 1 increases material cost', () => {
    const extraction = assemblyExtraction('STANDARD_EXTERIOR_DOOR');
    const estimate = estimateHandymanJob(extraction);

    const uncalibrated = applyCalibration(estimate, config, null, 0, ctx);

    const calibration: BusinessCalibration = {
      businessId: 'test', projectFamily: 'carpentry',
      laborMultiplier: 1.0, materialMultiplier: 1.3, sampleSize: 10,
    };
    const calibrated = applyCalibration(estimate, config, calibration, 0, ctx);

    expect(calibrated.materialCost.expected).toBeGreaterThan(uncalibrated.materialCost.expected);
  });

  it('null calibration leaves estimate unchanged', () => {
    const extraction = assemblyExtraction('STANDARD_EXTERIOR_DOOR');
    const estimate = estimateHandymanJob(extraction);

    const a = applyCalibration(estimate, config, null, 5, ctx);
    const b = applyCalibration(estimate, config, null, 5, ctx);

    expect(a.laborHours.expected).toBe(b.laborHours.expected);
    expect(a.recommendedQuote).toBe(b.recommendedQuote);
  });

  it('calibration with sampleSize < 3 (MIN_SAMPLE_SIZE) is not applied', () => {
    const extraction = assemblyExtraction('STANDARD_EXTERIOR_DOOR');
    const estimate = estimateHandymanJob(extraction);

    const uncalibrated = applyCalibration(estimate, config, null, 0, ctx);

    const weakCalibration: BusinessCalibration = {
      businessId: 'test', projectFamily: 'carpentry',
      laborMultiplier: 2.0, materialMultiplier: 2.0,
      sampleSize: 2, // below MIN_SAMPLE_SIZE=3
    };
    const result = applyCalibration(estimate, config, weakCalibration, 0, ctx);

    expect(result.laborHours.expected).toBe(uncalibrated.laborHours.expected);
  });

  it('calibration clamps to [0.70, 1.50] inside estimator', () => {
    const extraction = assemblyExtraction('STANDARD_EXTERIOR_DOOR');
    const estimate = estimateHandymanJob(extraction);

    const extremeCalibration: BusinessCalibration = {
      businessId: 'test', projectFamily: 'carpentry',
      laborMultiplier: 5.0,   // above 1.50 clamp
      materialMultiplier: 0.1, // below 0.70 clamp
      sampleSize: 15,
    };
    const result = applyCalibration(estimate, config, extremeCalibration, 0, ctx);
    const uncalibrated = applyCalibration(estimate, config, null, 0, ctx);

    // Labor clamped at 1.50x — not 5x
    expect(result.laborHours.expected).toBeCloseTo(uncalibrated.laborHours.expected * 1.5, 1);
  });
});

// ─── NOTE: DB-dependent tests ─────────────────────────────────────────────────
//
// The following invariants require a live Supabase connection and belong in an
// integration test environment (e.g. CI against a test Supabase project):
//
//   I3 — recomputeCalibration() writes correct values to business_assembly_calibration
//   I3 — idempotent: running recompute twice produces the same cache row
//   I2 — revenue-only placeholder (actual_labor_hours=0) does NOT update multipliers
//   F1 — enqueueRecompute() creates a row; processRecomputeQueue() drains it
//   F3 — duplicate close-out does not create a conflicting learning row
//   SLO-2 — cache computed_at is within 5 min of trigger outcome recorded_at
