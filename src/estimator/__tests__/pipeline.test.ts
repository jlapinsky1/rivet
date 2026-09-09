import { describe, it, expect } from 'vitest';
import { extractJobFactsStub } from '../extract';
import { estimateHandymanJob, applyCalibration } from '../estimator';
import { deriveRecommendation } from '../decision';
import { createAdjustmentEntry } from '../persistence';
import { ASSEMBLIES } from '../assemblies';
import type { BusinessCalibration, DecisionContext, ExtractionResult, ExtractedTask } from '../types';
import { defaultBusinessEconomicsConfig, defaultDecisionContext } from '../types';

// Import existing workItems to verify service type unchanged
import { workItems } from '../../admin/types';

const config = defaultBusinessEconomicsConfig('test-biz');
const context = defaultDecisionContext();

// ─── Assembly Path E2E ───

describe('Assembly path E2E', () => {
  it('small drywall patch → assembly path with correct range', () => {
    const extraction = extractJobFactsStub({
      description: 'Small hole in drywall, about fist-sized, needs patching.',
    });
    expect(extraction.assemblyCandidate).toBe('SMALL_DRYWALL_PATCH');
    expect(extraction.assemblyConfidence).toBeGreaterThan(0);

    const estimate = estimateHandymanJob(extraction);
    expect(estimate.estimationPath).toBe('assembly');
    expect(estimate.laborHours.expected).toBeLessThan(4);

    const job = applyCalibration(estimate, config, null, 15);
    expect(job.evaluatedPrice).toBeGreaterThan(0);

    const decision = deriveRecommendation(job, config, context);
    expect(['take', 'review', 'pass']).toContain(decision.recommendation);
    expect(decision.reasons.length).toBeGreaterThan(0);
  });

  it('exterior door replacement with water damage condition', () => {
    const extraction = extractJobFactsStub({
      description: 'Need this old exterior door replaced. Water damage around the frame.',
    });
    expect(extraction.assemblyCandidate).toBe('STANDARD_EXTERIOR_DOOR');
    expect(extraction.conditions).toContain('water_damage');

    const estimate = estimateHandymanJob(extraction);
    expect(estimate.riskFlags).toContain('hidden_water_damage');
  });

  it('TV mount above fireplace → correct assembly', () => {
    const extraction = extractJobFactsStub({
      description: 'Mount a 65 inch TV on the wall above my fireplace',
    });
    expect(extraction.assemblyCandidate).toBe('TV_MOUNT_ABOVE_FIREPLACE');

    const estimate = estimateHandymanJob(extraction);
    expect(estimate.estimationPath).toBe('assembly');
    expect(estimate.laborHours.expected).toBeLessThan(5);
    expect(estimate.laborHours.expected).toBeGreaterThan(1);
  });

  it('DRYWALL_SECTION_REPLACEMENT with calibration 1.2 → correct scaling, global unchanged', () => {
    const extraction: ExtractionResult = {
      tradeContexts: ['drywall_repair'],
      assemblyCandidate: 'DRYWALL_SECTION_REPLACEMENT',
      assemblyConfidence: 0.90,
      tasks: [],
      conditions: [],
      unknowns: [],
      materialSupplyStatus: 'contractor_supplied',
      overallConfidence: 0.85,
      rawDescription: 'Large drywall section needs replacing',
    };

    const estimate = estimateHandymanJob(extraction);

    const calibration: BusinessCalibration = {
      businessId: 'test',
      projectFamily: 'drywall_repair',
      laborMultiplier: 1.2,
      materialMultiplier: 1.0,
      sampleSize: 5,
    };

    const job = applyCalibration(estimate, config, calibration, 10);
    expect(job.laborHours.expected).toBeCloseTo(estimate.laborHours.expected * 1.2, 1);

    // Global assembly unchanged
    expect(ASSEMBLIES.DRYWALL_SECTION_REPLACEMENT.laborHours.expected).toBe(4.5);
  });
});

// ─── Component Path E2E ───

describe('Component path E2E', () => {
  it('weird custom job → component path with reasonable estimate', () => {
    // "Dog ripped trim off stairs and chewed two balusters"
    const extraction = extractJobFactsStub({
      description: 'My dog ripped the trim off the side of the stairs and chewed the bottom two balusters.',
    });

    // Should NOT match a known assembly
    expect(extraction.assemblyCandidate).toBeNull();
    expect(extraction.tasks.length).toBeGreaterThan(0);
    expect(extraction.tradeContexts).toContain('finish_carpentry');

    const estimate = estimateHandymanJob(extraction);
    expect(estimate.estimationPath).toBe('component');
    expect(estimate.laborHours.expected).toBeGreaterThan(0);
    expect(estimate.materialCost.expected).toBeGreaterThan(0);

    const job = applyCalibration(estimate, config, null, 10);
    const decision = deriveRecommendation(job, config, context);
    expect(['take', 'review', 'pass']).toContain(decision.recommendation);
  });

  it('mixed carpentry + plumbing job → component path', () => {
    const extraction = extractJobFactsStub({
      description: 'Need the rotted wood under my kitchen sink replaced, install a new faucet, and caulk everything.',
    });

    expect(extraction.assemblyCandidate).toBeNull();
    expect(extraction.tasks.length).toBeGreaterThan(1);

    const estimate = estimateHandymanJob(extraction);
    expect(estimate.estimationPath).toBe('component');
    expect(estimate.breakdown.length).toBeGreaterThan(2);
  });

  it('fence repair with post count → scales correctly', () => {
    const extraction = extractJobFactsStub({
      description: 'Repair 4 leaning fence posts and replace damaged boards.',
    });

    // Should match assembly for fence
    expect(extraction.assemblyCandidate).not.toBeNull();

    const estimate = estimateHandymanJob(extraction);
    expect(estimate.laborHours.expected).toBeGreaterThan(0);

    const job = applyCalibration(estimate, config, null, 20);
    const decision = deriveRecommendation(job, config, context);
    expect(['take', 'review', 'pass']).toContain(decision.recommendation);
  });

  it('completely unknown job → low confidence review', () => {
    const extraction = extractJobFactsStub({
      description: 'I need my chandelier cleaned and rewired',
    });

    const estimate = estimateHandymanJob(extraction);
    // Should have low confidence for weird job
    expect(estimate.confidence).toBeLessThan(0.80);

    const job = applyCalibration(estimate, config, null, 10);
    const decision = deriveRecommendation(job, config, context);
    // With low confidence, should at least review
    expect(['review', 'pass']).toContain(decision.recommendation);
  });
});

// ─── Shared Overhead ───

describe('Shared overhead', () => {
  it('multiple components do NOT each add full setup/cleanup', () => {
    const singleTask: ExtractionResult = {
      tradeContexts: ['general'],
      assemblyCandidate: null,
      assemblyConfidence: 0,
      tasks: [
        { component: 'patch_surface', quantity: 1, confidence: 0.85, source: 'observed' },
      ],
      conditions: [],
      unknowns: [],
      materialSupplyStatus: 'contractor_supplied',
      overallConfidence: 0.75,
      rawDescription: 'test',
    };

    const fourTasks: ExtractionResult = {
      ...singleTask,
      tasks: [
        { component: 'remove_existing_material', quantity: 1, confidence: 0.85, source: 'observed' },
        { component: 'install_board_or_trim', quantity: 1, confidence: 0.85, source: 'observed' },
        { component: 'patch_surface', quantity: 1, confidence: 0.85, source: 'observed' },
        { component: 'paint_or_touchup', quantity: 1, confidence: 0.85, source: 'observed' },
      ],
    };

    const oneResult = estimateHandymanJob(singleTask);
    const fourResult = estimateHandymanJob(fourTasks);

    // Both should have exactly one PROJECT_OVERHEAD entry
    const oneOverheads = oneResult.breakdown.filter(b => b.code === 'PROJECT_OVERHEAD');
    const fourOverheads = fourResult.breakdown.filter(b => b.code === 'PROJECT_OVERHEAD');
    expect(oneOverheads.length).toBe(1);
    expect(fourOverheads.length).toBe(1);
    expect(oneOverheads[0].deltaHours).toBe(fourOverheads[0].deltaHours);
  });
});

// ─── Adjustment Logging ───

describe('Adjustment logging', () => {
  it('systemValue is preserved across multiple edits', () => {
    const adj1 = createAdjustmentEntry({
      estimationRunId: 'run-1',
      businessId: 'biz-1',
      userId: 'user-1',
      field: 'price',
      systemValue: 500,
      previousValue: 500,
      newValue: 600,
      reasonCode: 'SYSTEM_TOO_LOW',
    });

    const adj2 = createAdjustmentEntry({
      estimationRunId: 'run-1',
      businessId: 'biz-1',
      userId: 'user-1',
      field: 'price',
      systemValue: 500,
      previousValue: 600,
      newValue: 650,
      reasonCode: 'OWNER_EXPERIENCE',
    });

    expect(adj1.systemValue).toBe(500);
    expect(adj2.systemValue).toBe(500);
    expect(adj1.previousValue).toBe(500);
    expect(adj2.previousValue).toBe(600);
    expect(adj1.id).not.toBe(adj2.id);
    expect(adj1.newValue).toBe(600);
    expect(adj2.newValue).toBe(650);
  });

  it('entries have timestamps', () => {
    const adj = createAdjustmentEntry({
      estimationRunId: 'run-1',
      businessId: 'biz-1',
      userId: 'user-1',
      field: 'laborHours',
      systemValue: 6.5,
      previousValue: 6.5,
      newValue: 8.0,
      reasonCode: 'SYSTEM_TOO_LOW',
    });
    expect(adj.createdAt).toBeTruthy();
    expect(new Date(adj.createdAt).getTime()).toBeGreaterThan(0);
  });
});

// ─── Service Type Regression ───

describe('Service type regression', () => {
  it('all WorkItems have Handyman serviceType for handyman account', () => {
    const handymanItems = workItems.filter(w => w.serviceType === 'Handyman');
    expect(handymanItems.length).toBe(workItems.length);
  });

  it('no junk removal items in handyman-only account', () => {
    const junkItems = workItems.filter(w => w.serviceType === 'Junk Removal');
    expect(junkItems.length).toBe(0);
  });
});
