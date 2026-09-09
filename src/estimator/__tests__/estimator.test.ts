import { describe, it, expect } from 'vitest';
import { ASSEMBLIES, KNOWN_ASSEMBLY_CODES, ASSEMBLY_CONFIDENCE_THRESHOLD } from '../assemblies';
import { TASK_COMPONENTS, KNOWN_COMPONENT_CODES } from '../components';
import { CONDITION_MODIFIERS, KNOWN_CONDITION_CODES } from '../modifiers';
import { estimateHandymanJob, applyCalibration } from '../estimator';
import { extractJobFactsStub } from '../extract';
import type {
  ExtractionResult,
  ExtractedTask,
  BusinessCalibration,
  Range,
} from '../types';
import { defaultBusinessEconomicsConfig } from '../types';

// ─── Helpers ───

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

function makeComponentExtraction(tasks: ExtractedTask[], overrides?: Partial<ExtractionResult>): ExtractionResult {
  return {
    tradeContexts: ['general_handyman'],
    assemblyCandidate: null,
    assemblyConfidence: 0,
    tasks,
    conditions: [],
    unknowns: [],
    materialSupplyStatus: 'contractor_supplied',
    overallConfidence: 0.75,
    rawDescription: 'test',
    ...overrides,
  };
}

function task(component: string, quantity = 1, opts?: Partial<ExtractedTask>): ExtractedTask {
  return { component, quantity, complexity: 'standard', confidence: 0.85, source: 'observed', ...opts };
}

function rangeValid(r: Range): boolean {
  return r.low <= r.expected && r.expected <= r.high;
}

const defaultConfig = defaultBusinessEconomicsConfig('test-biz');

// ─── Assembly Invariants ───

describe('Assemblies', () => {
  it('defines at least 15 assemblies', () => {
    expect(KNOWN_ASSEMBLY_CODES.size).toBeGreaterThanOrEqual(15);
  });

  it('all assemblies have valid labor/material ranges', () => {
    for (const [code, asm] of Object.entries(ASSEMBLIES)) {
      expect(rangeValid(asm.laborHours), `${code}.laborHours`).toBe(true);
      expect(rangeValid(asm.materialCost), `${code}.materialCost`).toBe(true);
    }
  });

  it('all assemblies have a tradeContext', () => {
    for (const [code, asm] of Object.entries(ASSEMBLIES)) {
      expect(asm.tradeContext, code).toBeTruthy();
    }
  });

  it('all assemblies are marked needs_domain_validation', () => {
    for (const asm of Object.values(ASSEMBLIES)) {
      expect(asm.validationStatus).toBe('needs_domain_validation');
    }
  });
});

// ─── Task Component Invariants ───

describe('Task Components', () => {
  it('defines at least 20 components', () => {
    expect(KNOWN_COMPONENT_CODES.size).toBeGreaterThanOrEqual(20);
  });

  it('all components have valid labor baselines', () => {
    for (const [code, comp] of Object.entries(TASK_COMPONENTS)) {
      expect(comp.labor.baseHours, `${code}.baseHours`).toBeGreaterThanOrEqual(0);
      expect(comp.labor.minimumHours, `${code}.minimumHours`).toBeGreaterThan(0);
      expect(comp.labor.hoursPerUnit, `${code}.hoursPerUnit`).toBeGreaterThanOrEqual(0);
    }
  });

  it('includes carpentry components', () => {
    expect(KNOWN_COMPONENT_CODES.has('install_structural_lumber')).toBe(true);
    expect(KNOWN_COMPONENT_CODES.has('install_decking')).toBe(true);
    expect(KNOWN_COMPONENT_CODES.has('build_stairs')).toBe(true);
    expect(KNOWN_COMPONENT_CODES.has('install_board_or_trim')).toBe(true);
    expect(KNOWN_COMPONENT_CODES.has('minor_framing')).toBe(true);
  });

  it('all components are marked needs_domain_validation', () => {
    for (const comp of Object.values(TASK_COMPONENTS)) {
      expect(comp.validationStatus).toBe('needs_domain_validation');
    }
  });
});

// ─── Condition Modifiers ───

describe('Condition Modifiers', () => {
  it('defines at least 10 conditions', () => {
    expect(KNOWN_CONDITION_CODES.size).toBeGreaterThanOrEqual(10);
  });

  it('water_damage has high-end labor multiplier and risk flag', () => {
    expect(CONDITION_MODIFIERS.water_damage.laborHighMultiplier).toBeGreaterThan(1);
    expect(CONDITION_MODIFIERS.water_damage.riskFlag).toBe('hidden_water_damage');
  });
});

// ─── Assembly Path Estimation ───

describe('Assembly path', () => {
  it('uses assembly when candidate is known and confidence is high', () => {
    const result = estimateHandymanJob(makeAssemblyExtraction('SMALL_DRYWALL_PATCH'));
    expect(result.estimationPath).toBe('assembly');
    expect(result.assemblyUsed).toBe('SMALL_DRYWALL_PATCH');
    expect(result.laborHours.expected).toBe(ASSEMBLIES.SMALL_DRYWALL_PATCH.laborHours.expected);
  });

  it('falls back to component path when assembly confidence is low', () => {
    const result = estimateHandymanJob(makeAssemblyExtraction('SMALL_DRYWALL_PATCH', {
      assemblyConfidence: 0.50,
      tasks: [task('patch_surface'), task('paint_or_touchup')],
    }));
    expect(result.estimationPath).toBe('component');
  });

  it('falls back to component path when assembly is unknown', () => {
    const result = estimateHandymanJob(makeComponentExtraction(
      [task('patch_surface')],
      { assemblyCandidate: 'TOTALLY_FAKE_ASSEMBLY', assemblyConfidence: 0.95 },
    ));
    expect(result.estimationPath).toBe('component');
  });

  it('DRYWALL_SECTION_REPLACEMENT has expected 4.5h base', () => {
    const result = estimateHandymanJob(makeAssemblyExtraction('DRYWALL_SECTION_REPLACEMENT'));
    const baseEntry = result.breakdown.find(b => b.code === 'ASSEMBLY_DRYWALL_SECTION_REPLACEMENT');
    expect(baseEntry).toBeDefined();
    expect(baseEntry!.deltaHours).toBe(4.5);
  });

  it('different assemblies produce different ranges', () => {
    const small = estimateHandymanJob(makeAssemblyExtraction('SMALL_DRYWALL_PATCH'));
    const section = estimateHandymanJob(makeAssemblyExtraction('DRYWALL_SECTION_REPLACEMENT'));
    expect(section.laborHours.expected).toBeGreaterThan(small.laborHours.expected);
    expect(section.materialCost.expected).toBeGreaterThan(small.materialCost.expected);
  });

  it('each assembly produces valid estimate', () => {
    for (const code of KNOWN_ASSEMBLY_CODES) {
      const result = estimateHandymanJob(makeAssemblyExtraction(code));
      expect(rangeValid(result.laborHours), `${code} laborHours`).toBe(true);
      expect(rangeValid(result.materialCost), `${code} materialCost`).toBe(true);
      expect(result.confidence).toBeGreaterThan(0);
    }
  });
});

// ─── Component Path Estimation ───

describe('Component path', () => {
  it('sums component labor and material', () => {
    const result = estimateHandymanJob(makeComponentExtraction([
      task('patch_surface', 2),
      task('paint_or_touchup', 1),
    ]));
    expect(result.estimationPath).toBe('component');
    expect(result.laborHours.expected).toBeGreaterThan(0);
    expect(result.materialCost.expected).toBeGreaterThan(0);
    expect(result.breakdown.length).toBeGreaterThan(2); // overhead + 2 tasks
  });

  it('project overhead is shared, not per-task', () => {
    const oneTask = estimateHandymanJob(makeComponentExtraction([task('patch_surface')]));
    const threeTasks = estimateHandymanJob(makeComponentExtraction([
      task('patch_surface'),
      task('sand_and_finish'),
      task('paint_or_touchup'),
    ]));

    // Both have exactly one PROJECT_OVERHEAD entry
    const oneOverhead = oneTask.breakdown.filter(b => b.code === 'PROJECT_OVERHEAD');
    const threeOverhead = threeTasks.breakdown.filter(b => b.code === 'PROJECT_OVERHEAD');
    expect(oneOverhead.length).toBe(1);
    expect(threeOverhead.length).toBe(1);
    expect(oneOverhead[0].deltaHours).toBe(threeOverhead[0].deltaHours);
  });

  it('quantity scales component hours', () => {
    const one = estimateHandymanJob(makeComponentExtraction([task('set_post', 1)]));
    const four = estimateHandymanJob(makeComponentExtraction([task('set_post', 4)]));
    expect(four.laborHours.expected).toBeGreaterThan(one.laborHours.expected);
  });

  it('high complexity increases hours vs standard', () => {
    const standard = estimateHandymanJob(makeComponentExtraction([task('replace_fixture', 1, { complexity: 'standard' })]));
    const high = estimateHandymanJob(makeComponentExtraction([task('replace_fixture', 1, { complexity: 'high' })]));
    expect(high.laborHours.expected).toBeGreaterThan(standard.laborHours.expected);
  });

  it('unknown component flags safely and lowers confidence', () => {
    const result = estimateHandymanJob(makeComponentExtraction([
      task('patch_surface'),
      task('totally_fake_component' as any),
    ]));
    expect(result.riskFlags).toContain('unsupported_task_component');
    expect(result.confidence).toBeLessThan(0.75);
  });

  it('no tasks → very low confidence + wide fallback range', () => {
    const result = estimateHandymanJob(makeComponentExtraction([]));
    expect(result.confidence).toBeLessThanOrEqual(0.20);
    expect(result.riskFlags).toContain('no_tasks_extracted');
    expect(result.laborHours.high).toBeGreaterThan(result.laborHours.low * 2);
  });

  it('poor component coverage lowers confidence', () => {
    // 3 tasks, 2 unknown → < 50% recognized
    const result = estimateHandymanJob(makeComponentExtraction([
      task('patch_surface'),
      task('fake_1' as any),
      task('fake_2' as any),
    ]));
    expect(result.riskFlags).toContain('poor_component_coverage');
  });

  it('inferred tasks have wider high-end range', () => {
    const observed = estimateHandymanJob(makeComponentExtraction([task('install_board_or_trim', 3, { source: 'observed' })]));
    const inferred = estimateHandymanJob(makeComponentExtraction([task('install_board_or_trim', 3, { source: 'inferred' })]));
    expect(inferred.laborHours.high).toBeGreaterThanOrEqual(observed.laborHours.high);
  });
});

// ─── Condition Modifiers in Estimation ───

describe('Conditions applied to estimates', () => {
  it('water_damage widens high-end and lowers confidence', () => {
    const normal = estimateHandymanJob(makeAssemblyExtraction('MEDIUM_DRYWALL_PATCH'));
    const withWater = estimateHandymanJob(makeAssemblyExtraction('MEDIUM_DRYWALL_PATCH', {
      conditions: ['water_damage'],
    }));
    expect(withWater.laborHours.high).toBeGreaterThan(normal.laborHours.high);
    expect(withWater.confidence).toBeLessThan(normal.confidence);
    expect(withWater.riskFlags).toContain('hidden_water_damage');
  });

  it('customer_supplied_material reduces material cost', () => {
    const normal = estimateHandymanJob(makeAssemblyExtraction('STANDARD_EXTERIOR_DOOR'));
    const supplied = estimateHandymanJob(makeAssemblyExtraction('STANDARD_EXTERIOR_DOOR', {
      materialSupplyStatus: 'customer_supplied',
    }));
    expect(supplied.materialCost.expected).toBeLessThan(normal.materialCost.expected);
    expect(supplied.riskFlags).toContain('customer_supplied_compatibility');
  });

  it('unknown materialSupplyStatus widens material range', () => {
    const known = estimateHandymanJob(makeAssemblyExtraction('STANDARD_TV_MOUNT'));
    const unknown = estimateHandymanJob(makeAssemblyExtraction('STANDARD_TV_MOUNT', {
      materialSupplyStatus: 'unknown',
    }));
    expect(unknown.materialCost.high).toBeGreaterThan(known.materialCost.high);
  });

  it('unknowns reduce confidence', () => {
    const clean = estimateHandymanJob(makeAssemblyExtraction('SMALL_DRYWALL_PATCH', { unknowns: [] }));
    const uncertain = estimateHandymanJob(makeAssemblyExtraction('SMALL_DRYWALL_PATCH', {
      unknowns: ['a', 'b', 'c', 'd', 'e'],
    }));
    expect(uncertain.confidence).toBeLessThan(clean.confidence);
  });
});

// ─── Calibration ───

describe('applyCalibration', () => {
  const baseEstimate = estimateHandymanJob(makeAssemblyExtraction('DRYWALL_SECTION_REPLACEMENT'));

  it('applies multiplier when sampleSize >= 3', () => {
    const calibration: BusinessCalibration = {
      businessId: 'test', projectFamily: 'drywall_repair',
      laborMultiplier: 1.2, materialMultiplier: 1.1, sampleSize: 5,
    };
    const result = applyCalibration(baseEstimate, defaultConfig, calibration, 10);
    const uncalibrated = applyCalibration(baseEstimate, defaultConfig, null, 10);
    expect(result.laborHours.expected).toBeCloseTo(uncalibrated.laborHours.expected * 1.2, 1);
  });

  it('skips calibration when sampleSize < 3', () => {
    const calibration: BusinessCalibration = {
      businessId: 'test', projectFamily: 'drywall_repair',
      laborMultiplier: 1.5, materialMultiplier: 1.5, sampleSize: 2,
    };
    const calibrated = applyCalibration(baseEstimate, defaultConfig, calibration, 10);
    const uncalibrated = applyCalibration(baseEstimate, defaultConfig, null, 10);
    expect(calibrated.laborHours.expected).toBe(uncalibrated.laborHours.expected);
  });

  it('bounds multiplier to 0.7-1.5', () => {
    const extreme: BusinessCalibration = {
      businessId: 'test', projectFamily: 'drywall_repair',
      laborMultiplier: 3.0, materialMultiplier: 0.1, sampleSize: 10,
    };
    const result = applyCalibration(baseEstimate, defaultConfig, extreme, 10);
    const uncalibrated = applyCalibration(baseEstimate, defaultConfig, null, 10);
    expect(result.laborHours.expected).toBeCloseTo(uncalibrated.laborHours.expected * 1.5, 1);
  });

  it('does NOT overwrite assembly data', () => {
    const before = JSON.parse(JSON.stringify(ASSEMBLIES.DRYWALL_SECTION_REPLACEMENT));
    const calibration: BusinessCalibration = {
      businessId: 'test', projectFamily: 'drywall_repair',
      laborMultiplier: 1.3, materialMultiplier: 1.2, sampleSize: 5,
    };
    applyCalibration(baseEstimate, defaultConfig, calibration, 10);
    expect(ASSEMBLIES.DRYWALL_SECTION_REPLACEMENT).toEqual(before);
  });
});

// ─── EconomicJob ───

describe('EconomicJob', () => {
  const estimate = estimateHandymanJob(makeAssemblyExtraction('STANDARD_EXTERIOR_DOOR'));
  const job = applyCalibration(estimate, defaultConfig, null, 15);

  it('totalDirectCost does NOT include owner labor', () => {
    const expectedDirect = job.materialCost.expected + job.travelCost + job.helperLaborCost.expected;
    expect(job.totalDirectCost.expected).toBeCloseTo(expectedDirect, 2);
  });

  it('contributionProfit = price - totalDirectCost', () => {
    expect(job.contributionProfit.expected).toBeCloseTo(
      job.suggestedPrice.expected - job.totalDirectCost.expected, 2
    );
  });

  it('ownerAdjustedProfit = contributionProfit - (hours × ownerRate)', () => {
    const ownerCost = job.laborHours.expected * defaultConfig.ownerOpportunityRatePerHour;
    expect(job.ownerAdjustedProfit.expected).toBeCloseTo(
      job.contributionProfit.expected - ownerCost, 2
    );
  });

  it('contributionProfit > ownerAdjustedProfit when owner works', () => {
    expect(job.contributionProfit.expected).toBeGreaterThan(job.ownerAdjustedProfit.expected);
  });

  it('enforces minimum job price', () => {
    expect(job.suggestedPrice.expected).toBeGreaterThanOrEqual(defaultConfig.minimumJobPrice);
  });

  it('all ranges are valid', () => {
    expect(rangeValid(job.laborHours)).toBe(true);
    expect(rangeValid(job.materialCost)).toBe(true);
    expect(rangeValid(job.suggestedPrice)).toBe(true);
    expect(rangeValid(job.totalDirectCost)).toBe(true);
    expect(rangeValid(job.contributionProfit)).toBe(true);
  });
});

// ─── Tier Separation ───

describe('Tier separation', () => {
  it('AI extraction (stub) does NOT return labor hours or prices', () => {
    const result = extractJobFactsStub({ description: 'Replace my exterior door' });
    const json = JSON.stringify(result);
    expect(json).not.toContain('"laborHours"');
    expect(json).not.toContain('"price"');
    expect(json).not.toContain('"suggestedPrice"');
    expect(json).not.toContain('"totalCost"');
  });

  it('calibration changes estimate but NOT global assembly data', () => {
    const before = ASSEMBLIES.DRYWALL_SECTION_REPLACEMENT.laborHours.expected;
    const estimate = estimateHandymanJob(makeAssemblyExtraction('DRYWALL_SECTION_REPLACEMENT'));
    const calibration: BusinessCalibration = {
      businessId: 'test', projectFamily: 'drywall_repair',
      laborMultiplier: 1.2, materialMultiplier: 1.0, sampleSize: 5,
    };
    const job = applyCalibration(estimate, defaultConfig, calibration, 10);
    expect(job.laborHours.expected).toBeCloseTo(estimate.laborHours.expected * 1.2, 1);
    expect(ASSEMBLIES.DRYWALL_SECTION_REPLACEMENT.laborHours.expected).toBe(before);
  });

  it('business economics change pricing but NOT trade estimation', () => {
    const estimate = estimateHandymanJob(makeAssemblyExtraction('DRYWALL_SECTION_REPLACEMENT'));
    const cheapConfig = { ...defaultConfig, materialMarkupPercent: 5 };
    const expensiveConfig = { ...defaultConfig, materialMarkupPercent: 50 };
    const cheap = applyCalibration(estimate, cheapConfig, null, 10);
    const expensive = applyCalibration(estimate, expensiveConfig, null, 10);
    expect(cheap.laborHours.expected).toBe(expensive.laborHours.expected);
    expect(expensive.materialCost.expected).toBeGreaterThan(cheap.materialCost.expected);
  });
});
