import { ASSEMBLIES, KNOWN_ASSEMBLY_CODES, ASSEMBLY_CONFIDENCE_THRESHOLD } from './assemblies';
import { TASK_COMPONENTS, KNOWN_COMPONENT_CODES } from './components';
import { CONDITION_MODIFIERS, KNOWN_CONDITION_CODES } from './modifiers';
import type {
  ExtractionResult,
  EstimatorOutput,
  EconomicJob,
  BusinessEconomicsConfig,
  BusinessCalibration,
  DecisionContext,
  PricingFloors,
  Range,
  BreakdownEntry,
  ConditionCode,
} from './types';
import { ESTIMATOR_VERSION } from './types';

// ─── Range Math Helpers ───

function addRange(a: Range, b: Range): Range {
  return { low: a.low + b.low, expected: a.expected + b.expected, high: a.high + b.high };
}

function scaleRange(r: Range, factor: number): Range {
  return { low: r.low * factor, expected: r.expected * factor, high: r.high * factor };
}

function divRange(r: Range, divisor: number): Range {
  if (divisor === 0) return { low: 0, expected: 0, high: 0 };
  return { low: r.low / divisor, expected: r.expected / divisor, high: r.high / divisor };
}

function subtractRange(a: Range, b: Range): Range {
  return { low: a.low - b.high, expected: a.expected - b.expected, high: a.high - b.low };
}

function clampRange(r: Range): Range {
  return { low: Math.max(0, r.low), expected: Math.max(0, r.expected), high: Math.max(0, r.high) };
}

function constantRange(v: number): Range {
  return { low: v, expected: v, high: v };
}

function orderRange(r: Range): Range {
  return {
    low: Math.min(r.low, r.expected),
    expected: r.expected,
    high: Math.max(r.high, r.expected),
  };
}

// ─── Rounding Helpers (applied at output boundaries only) ───

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundHours(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundConfidence(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function roundMoneyRange(r: Range): Range {
  return { low: roundMoney(r.low), expected: roundMoney(r.expected), high: roundMoney(r.high) };
}

function roundHoursRange(r: Range): Range {
  return { low: roundHours(r.low), expected: roundHours(r.expected), high: roundHours(r.high) };
}

// ─── Confidence Overlap Dedup ───
// Conditions that already describe an uncertainty should not stack with
// unknowns that name the same concern.

const CONDITION_RELATED_UNKNOWNS: Record<string, string[]> = {
  water_damage: ['extent_of_water_damage', 'water_damage_extent', 'hidden_water_damage_extent'],
  unknown_substrate: ['substrate_type', 'substrate_material'],
};

function deduplicateUnknownConfidence(
  unknowns: string[],
  activeConditions: string[],
): { penalty: number; deduped: string[]; missingInputs: string[] } {
  const coveredUnknowns = new Set<string>();
  for (const cond of activeConditions) {
    const related = CONDITION_RELATED_UNKNOWNS[cond];
    if (related) {
      for (const u of related) coveredUnknowns.add(u);
    }
  }

  let penalty = 0;
  const deduped: string[] = [];
  const missingInputs: string[] = [];
  for (const u of unknowns) {
    missingInputs.push(u);
    if (coveredUnknowns.has(u)) {
      deduped.push(u);
    } else {
      penalty -= 0.05;
    }
  }
  return { penalty, deduped, missingInputs };
}

// ─── Project Overhead ───

const PROJECT_SETUP_HOURS = 0.25;
const PROJECT_CLEANUP_HOURS = 0.20;
const PROCUREMENT_BASE_HOURS = 0.50;

// ─── Assembly Path ───

function estimateViaAssembly(extraction: ExtractionResult): EstimatorOutput {
  const assembly = ASSEMBLIES[extraction.assemblyCandidate!];
  const breakdown: BreakdownEntry[] = [];
  const riskFlags: string[] = [];
  let confidence = extraction.assemblyConfidence;

  const laborHours: Range = { ...assembly.laborHours };
  const materialCost: Range = { ...assembly.materialCost };

  breakdown.push({
    code: `ASSEMBLY_${assembly.code}`,
    description: assembly.description,
    deltaHours: assembly.laborHours.expected,
    deltaMaterialCost: assembly.materialCost.expected,
  });

  // Apply condition modifiers
  const { condConfidence, condRiskFlags, condBreakdown } =
    applyConditions(extraction.conditions, laborHours, materialCost);
  confidence += condConfidence;
  riskFlags.push(...condRiskFlags);
  breakdown.push(...condBreakdown);

  // Material supply
  if (extraction.materialSupplyStatus === 'customer_supplied') {
    scaleRangeInPlace(materialCost, 0.30);
    riskFlags.push('customer_supplied_compatibility');
    breakdown.push({ code: 'CUSTOMER_SUPPLIED', description: 'Customer supplies primary materials', deltaHours: 0, deltaMaterialCost: 0 });
  } else if (extraction.materialSupplyStatus === 'unknown') {
    widenHighInPlace(materialCost, 1.25);
    confidence -= 0.05;
  }

  // Unknowns (with confidence overlap dedup)
  const { penalty: unknownPenalty, deduped, missingInputs } =
    deduplicateUnknownConfidence(extraction.unknowns, extraction.conditions);
  confidence += unknownPenalty;
  if (deduped.length > 0) {
    breakdown.push({
      code: 'CONF_DEDUP',
      description: `Unknowns already covered by conditions (no extra penalty): ${deduped.join(', ')}`,
      deltaHours: 0,
      deltaMaterialCost: 0,
    });
  }

  confidence = Math.max(0.05, Math.min(1.0, confidence));

  return {
    estimationPath: 'assembly',
    assemblyUsed: assembly.code,
    tradeContexts: extraction.tradeContexts,
    laborHours: orderRange(clampRange(laborHours)),
    materialCost: orderRange(clampRange(materialCost)),
    breakdown,
    riskFlags: [...new Set(riskFlags)],
    confidence,
    missingInputs,
    estimatorVersion: ESTIMATOR_VERSION,
  };
}

// ─── Component Path ───

function estimateViaComponents(extraction: ExtractionResult): EstimatorOutput {
  const breakdown: BreakdownEntry[] = [];
  const riskFlags: string[] = [];
  let confidence = extraction.overallConfidence;

  let totalLaborHours: Range = { low: 0, expected: 0, high: 0 };
  let totalMaterialCost: Range = { low: 0, expected: 0, high: 0 };

  // Project-level shared overhead (NOT per-component)
  totalLaborHours = addRange(totalLaborHours, {
    low: PROJECT_SETUP_HOURS,
    expected: PROJECT_SETUP_HOURS,
    high: PROJECT_SETUP_HOURS * 1.5,
  });
  totalLaborHours = addRange(totalLaborHours, {
    low: PROJECT_CLEANUP_HOURS,
    expected: PROJECT_CLEANUP_HOURS,
    high: PROJECT_CLEANUP_HOURS * 1.5,
  });

  breakdown.push({
    code: 'PROJECT_OVERHEAD',
    description: 'Shared setup and cleanup',
    deltaHours: PROJECT_SETUP_HOURS + PROJECT_CLEANUP_HOURS,
    deltaMaterialCost: 0,
  });

  let recognizedTasks = 0;
  let totalTasks = extraction.tasks.length;

  for (const task of extraction.tasks) {
    const comp = TASK_COMPONENTS[task.component as keyof typeof TASK_COMPONENTS];

    if (!comp) {
      // Unknown component — flag it but don't crash
      riskFlags.push('unsupported_task_component');
      confidence -= 0.10;
      breakdown.push({
        code: `UNKNOWN_${task.component.toUpperCase()}`,
        description: `Unrecognized component: ${task.component}`,
        deltaHours: 0,
        deltaMaterialCost: 0,
      });
      continue;
    }

    recognizedTasks++;
    const qty = Math.max(1, task.quantity);

    // Skip site_setup and cleanup as individual tasks — handled by project overhead
    if (task.component === 'site_setup' || task.component === 'cleanup') {
      continue;
    }

    // Compute hours: max(minimumHours, baseHours + hoursPerUnit * qty)
    const expectedHours = Math.max(comp.labor.minimumHours, comp.labor.baseHours + comp.labor.hoursPerUnit * qty);

    // Complexity scaling
    const complexityFactor = task.complexity === 'high' ? 1.3 : task.complexity === 'low' ? 0.85 : 1.0;
    const scaledExpected = expectedHours * complexityFactor;

    const taskLabor: Range = {
      low: scaledExpected * 0.75,
      expected: scaledExpected,
      high: scaledExpected * 1.35,
    };

    const taskMaterial: Range = {
      low: comp.materials.allowancePerUnit * qty * 0.7,
      expected: comp.materials.allowancePerUnit * qty,
      high: comp.materials.allowancePerUnit * qty * 1.4,
    };

    // Inferred tasks get wider range
    if (task.source === 'inferred') {
      taskLabor.high *= 1.15;
      taskMaterial.high *= 1.15;
    }

    totalLaborHours = addRange(totalLaborHours, taskLabor);
    totalMaterialCost = addRange(totalMaterialCost, taskMaterial);

    // Per-task confidence impact
    if (task.confidence < 0.6) confidence -= 0.05;

    breakdown.push({
      code: comp.code.toUpperCase(),
      description: `${comp.description} (×${qty})`,
      deltaHours: scaledExpected,
      deltaMaterialCost: comp.materials.allowancePerUnit * qty,
    });
  }

  // Component coverage check
  if (totalTasks === 0) {
    riskFlags.push('no_tasks_extracted');
    confidence = Math.min(confidence, 0.20);
    // Fallback wide range
    totalLaborHours = { low: 2, expected: 5, high: 14 };
    totalMaterialCost = { low: 50, expected: 200, high: 500 };
    breakdown.push({ code: 'FALLBACK_ESTIMATE', description: 'No tasks extracted — wide fallback range', deltaHours: 5, deltaMaterialCost: 200 });
  } else if (recognizedTasks < totalTasks * 0.5) {
    riskFlags.push('poor_component_coverage');
    confidence -= 0.15;
  }

  // Component-composed jobs get slightly wider ranges (more uncertainty than assemblies)
  totalLaborHours.high *= 1.10;
  totalMaterialCost.high *= 1.10;

  // Apply condition modifiers
  const { condConfidence, condRiskFlags, condBreakdown } =
    applyConditions(extraction.conditions, totalLaborHours, totalMaterialCost);
  confidence += condConfidence;
  riskFlags.push(...condRiskFlags);
  breakdown.push(...condBreakdown);

  // Material supply
  if (extraction.materialSupplyStatus === 'customer_supplied') {
    scaleRangeInPlace(totalMaterialCost, 0.30);
    riskFlags.push('customer_supplied_compatibility');
  } else if (extraction.materialSupplyStatus === 'unknown') {
    widenHighInPlace(totalMaterialCost, 1.25);
    confidence -= 0.05;
  }

  // Unknowns (with confidence overlap dedup)
  const { penalty: unknownPenalty, deduped, missingInputs } =
    deduplicateUnknownConfidence(extraction.unknowns, extraction.conditions);
  confidence += unknownPenalty;
  if (deduped.length > 0) {
    breakdown.push({
      code: 'CONF_DEDUP',
      description: `Unknowns already covered by conditions (no extra penalty): ${deduped.join(', ')}`,
      deltaHours: 0,
      deltaMaterialCost: 0,
    });
  }

  confidence = Math.max(0.05, Math.min(1.0, confidence));

  return {
    estimationPath: 'component',
    tradeContexts: extraction.tradeContexts,
    laborHours: orderRange(clampRange(totalLaborHours)),
    materialCost: orderRange(clampRange(totalMaterialCost)),
    breakdown,
    riskFlags: [...new Set(riskFlags)],
    confidence,
    missingInputs,
    estimatorVersion: ESTIMATOR_VERSION,
  };
}

// ─── Condition Modifier Application (mutates ranges in place) ───

function applyConditions(
  conditions: string[],
  laborHours: Range,
  materialCost: Range,
): { condConfidence: number; condRiskFlags: string[]; condBreakdown: BreakdownEntry[] } {
  let condConfidence = 0;
  const condRiskFlags: string[] = [];
  const condBreakdown: BreakdownEntry[] = [];

  for (const cond of conditions) {
    if (!KNOWN_CONDITION_CODES.has(cond)) continue;
    const mod = CONDITION_MODIFIERS[cond as ConditionCode];

    if (mod.laborMultiplier) {
      laborHours.low *= mod.laborMultiplier;
      laborHours.expected *= mod.laborMultiplier;
      laborHours.high *= mod.laborHighMultiplier ?? mod.laborMultiplier;
    } else if (mod.laborHighMultiplier) {
      laborHours.high *= mod.laborHighMultiplier;
    }

    if (mod.materialMultiplier) {
      materialCost.low *= mod.materialMultiplier;
      materialCost.expected *= mod.materialMultiplier;
      materialCost.high *= mod.materialMultiplier;
    }

    if (mod.confidenceDelta) condConfidence += mod.confidenceDelta;
    if (mod.riskFlag) condRiskFlags.push(mod.riskFlag);

    condBreakdown.push({
      code: `COND_${cond.toUpperCase()}`,
      description: mod.description,
      deltaHours: 0,
      deltaMaterialCost: 0,
    });
  }

  return { condConfidence, condRiskFlags, condBreakdown };
}

// ─── Range Mutation Helpers ───

function scaleRangeInPlace(r: Range, factor: number): void {
  r.low *= factor;
  r.expected *= factor;
  r.high *= factor;
}

function widenHighInPlace(r: Range, factor: number): void {
  r.high *= factor;
}

// ─── Main Estimator Entry Point ───

export function estimateHandymanJob(extraction: ExtractionResult): EstimatorOutput {
  // Assembly path: known assembly + high confidence
  if (
    extraction.assemblyCandidate &&
    KNOWN_ASSEMBLY_CODES.has(extraction.assemblyCandidate) &&
    extraction.assemblyConfidence >= ASSEMBLY_CONFIDENCE_THRESHOLD
  ) {
    return estimateViaAssembly(extraction);
  }

  // Component path: decomposed tasks
  return estimateViaComponents(extraction);
}

// ─── Calibration + Economics → EconomicJob ───

const CALIBRATION_MIN = 0.7;
const CALIBRATION_MAX = 1.5;
const MIN_SAMPLE_SIZE = 3;

function clampMultiplier(m: number): number {
  return Math.max(CALIBRATION_MIN, Math.min(CALIBRATION_MAX, m));
}

// ─── Return Trip Capacity Modeling ───

function getMaxReturnTripRisk(conditions: string[]): 'low' | 'medium' | 'high' | null {
  let max: 'low' | 'medium' | 'high' | null = null;
  const rank = { low: 1, medium: 2, high: 3 };
  for (const cond of conditions) {
    if (!KNOWN_CONDITION_CODES.has(cond)) continue;
    const mod = CONDITION_MODIFIERS[cond as ConditionCode];
    if (mod.returnTripRisk) {
      if (!max || rank[mod.returnTripRisk] > rank[max]) {
        max = mod.returnTripRisk;
      }
    }
  }
  return max;
}

export function applyCalibration(
  estimate: EstimatorOutput,
  config: BusinessEconomicsConfig,
  calibration: BusinessCalibration | null,
  travelDistanceMiles: number,
  context?: DecisionContext,
): EconomicJob {
  let laborMult = 1.0;
  let materialMult = 1.0;
  if (calibration && calibration.sampleSize >= MIN_SAMPLE_SIZE) {
    laborMult = clampMultiplier(calibration.laborMultiplier);
    materialMult = clampMultiplier(calibration.materialMultiplier);
  }

  const laborHours = scaleRange(estimate.laborHours, laborMult);
  const helperLaborCost = constantRange(0);
  const rawMaterial = scaleRange(estimate.materialCost, materialMult);
  const materialCost = scaleRange(rawMaterial, 1 + config.materialMarkupPercent / 100);
  const travelCost = travelDistanceMiles * config.mileageRate * 2;
  const totalDirectCost = addRange(addRange(materialCost, constantRange(travelCost)), helperLaborCost);

  // ─── Capacity Hours ───
  // Extract active conditions from breakdown (COND_ prefixed entries)
  const activeConditions = estimate.breakdown
    .filter(b => b.code.startsWith('COND_'))
    .map(b => b.code.replace('COND_', '').toLowerCase());

  const travelHours = (travelDistanceMiles * 2) / 30;
  const procurementHours = PROCUREMENT_BASE_HOURS;

  // Model return trip capacity from condition returnTripRisk
  const returnTripRisk = getMaxReturnTripRisk(activeConditions);
  const oneWayTravelHours = travelDistanceMiles / 30;
  const returnTripHours =
    returnTripRisk === 'high' ? oneWayTravelHours * 2 :
    returnTripRisk === 'medium' ? oneWayTravelHours : 0;

  const capacityHours = laborHours.expected + travelHours + procurementHours + returnTripHours;

  // ─── Multi-Floor Pricing ───
  const expectedDirectCost = totalDirectCost.expected;
  const marginFactor = 1 / (1 - config.marginFloorPercent / 100);

  const floors: PricingFloors = {
    minimumJob: config.minimumJobPrice,
    margin: expectedDirectCost * marginFactor,
    absoluteProfit: expectedDirectCost + config.profitFloorAbsolute,
    laborProductivity: expectedDirectCost + (laborHours.expected * config.minimumHourlyRate),
    weeklyCapacityPace: (context && context.requiredContributionPerCapacityHour > 0)
      ? expectedDirectCost + (capacityHours * context.requiredContributionPerCapacityHour)
      : 0,
    binding: 'minimumJob',
  };

  // Find binding floor
  let maxFloor = 0;
  for (const [key, value] of Object.entries(floors)) {
    if (key === 'binding') continue;
    if ((value as number) > maxFloor) {
      maxFloor = value as number;
      floors.binding = key;
    }
  }
  const minimumAcceptablePrice = maxFloor;

  // Round floor values for display
  floors.minimumJob = roundMoney(floors.minimumJob);
  floors.margin = roundMoney(floors.margin);
  floors.absoluteProfit = roundMoney(floors.absoluteProfit);
  floors.laborProductivity = roundMoney(floors.laborProductivity);
  floors.weeklyCapacityPace = roundMoney(floors.weeklyCapacityPace);

  // ─── Estimated Quote (NOT floored at minimumAcceptablePrice) ───
  // Labor-based pricing: what the job is worth at market rates.
  // targetLaborRate = minimumHourlyRate × 1.2 — what an owner would typically charge.
  const targetLaborRate = config.minimumHourlyRate * 1.2;
  const laborRevenue = scaleRange(laborHours, targetLaborRate);
  const estimatedQuoteRange: Range = {
    low: laborRevenue.low + totalDirectCost.low,
    expected: laborRevenue.expected + totalDirectCost.expected,
    high: laborRevenue.high + totalDirectCost.high,
  };
  const recommendedQuote = estimatedQuoteRange.expected;
  const evaluatedPrice = recommendedQuote;

  // ─── Profit Metrics (at evaluatedPrice) ───
  const contributionProfit = clampRange(subtractRange(constantRange(evaluatedPrice), totalDirectCost));

  const contributionMargin: Range = {
    low: evaluatedPrice > 0 ? contributionProfit.low / evaluatedPrice : 0,
    expected: evaluatedPrice > 0 ? contributionProfit.expected / evaluatedPrice : 0,
    high: evaluatedPrice > 0 ? contributionProfit.high / evaluatedPrice : 0,
  };

  const contributionPerLaborHour = divRange(contributionProfit, laborHours.expected);
  const contributionPerCapacityHour = capacityHours > 0
    ? contributionProfit.expected / capacityHours : 0;

  // ─── Owner-Adjusted (analytical only) ───
  const ownerTimeCost = scaleRange(laborHours, config.ownerOpportunityRatePerHour);
  const ownerAdjustedProfit = subtractRange(contributionProfit, ownerTimeCost);
  const ownerAdjustedPerHour = divRange(ownerAdjustedProfit, laborHours.expected);

  return {
    laborHours: roundHoursRange(laborHours),
    capacityHours: roundHours(capacityHours),
    procurementHours: roundHours(procurementHours),
    travelHours: roundHours(travelHours),
    returnTripHours: roundHours(returnTripHours),
    materialCost: roundMoneyRange(materialCost),
    travelCost: roundMoney(travelCost),
    helperLaborCost: roundMoneyRange(helperLaborCost),
    totalDirectCost: roundMoneyRange(totalDirectCost),
    minimumAcceptablePrice: roundMoney(minimumAcceptablePrice),
    pricingFloors: floors,
    estimatedQuoteRange: roundMoneyRange(estimatedQuoteRange),
    recommendedQuote: roundMoney(recommendedQuote),
    evaluatedPrice: roundMoney(evaluatedPrice),
    contributionProfit: roundMoneyRange(contributionProfit),
    contributionMargin: roundMoneyRange(contributionMargin),
    contributionPerLaborHour: roundMoneyRange(contributionPerLaborHour),
    contributionPerCapacityHour: roundMoney(contributionPerCapacityHour),
    ownerAdjustedProfit: roundMoneyRange(ownerAdjustedProfit),
    ownerAdjustedPerHour: roundMoneyRange(ownerAdjustedPerHour),
    confidence: roundConfidence(estimate.confidence),
    riskFlags: [...new Set(estimate.riskFlags)],
    breakdown: [...estimate.breakdown],
  };
}
