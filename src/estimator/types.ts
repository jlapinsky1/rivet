// ─── Core Enums & Unions ───

export type HandymanJobFamily =
  | 'exterior_door_replacement'
  | 'drywall_repair'
  | 'deck_repair'
  | 'fence_repair'
  | 'tv_wall_mounting';

export const HANDYMAN_JOB_FAMILIES: HandymanJobFamily[] = [
  'exterior_door_replacement',
  'drywall_repair',
  'deck_repair',
  'fence_repair',
  'tv_wall_mounting',
];

export type ServiceVertical = 'handyman' | 'junk_removal';

export type Range = { low: number; expected: number; high: number };

export type MaterialSupplyStatus = 'customer_supplied' | 'contractor_supplied' | 'unknown';

export type ReasonCode =
  | 'SYSTEM_TOO_LOW'
  | 'SYSTEM_TOO_HIGH'
  | 'SCOPE_CHANGED'
  | 'NEW_CUSTOMER_INFO'
  | 'OWNER_EXPERIENCE'
  | 'MATERIAL_COST_DIFFERENT'
  | 'SITE_CONDITION_DIFFERENT'
  | 'OTHER';

export type Recommendation = 'take' | 'review' | 'pass';

export type ReasonItem = { icon: 'check' | 'caution' | 'x'; text: string };

// ─── Task Components ───

export type TaskComponentCode =
  | 'site_setup'
  | 'protect_work_area'
  | 'remove_existing_material'
  | 'demolition_light'
  | 'measure_and_layout'
  | 'cut_and_fit_material'
  | 'install_sheet_material'
  | 'install_board_or_trim'
  | 'install_structural_lumber'
  | 'install_decking'
  | 'fasten_or_anchor'
  | 'patch_surface'
  | 'tape_and_mud'
  | 'sand_and_finish'
  | 'paint_or_touchup'
  | 'seal_or_caulk'
  | 'install_fixture'
  | 'replace_fixture'
  | 'mount_object'
  | 'minor_framing'
  | 'repair_railing'
  | 'set_post'
  | 'build_stairs'
  | 'assemble_item'
  | 'cleanup';

export type TaskComponentDef = {
  code: TaskComponentCode;
  description: string;
  labor: {
    baseHours: number;
    hoursPerUnit: number;
    minimumHours: number;
  };
  materials: {
    allowancePerUnit: number;
  };
  validationStatus: ValidationStatus;
};

// ─── Condition Modifiers ───

export type ConditionCode =
  | 'confined_access'
  | 'overhead_work'
  | 'second_floor_access'
  | 'steep_terrain'
  | 'occupied_workspace'
  | 'finish_matching'
  | 'customer_supplied_material'
  | 'unknown_substrate'
  | 'near_electrical'
  | 'water_damage'
  | 'special_order_material'
  | 'multiple_visits_required';

export type ConditionModifierDef = {
  code: ConditionCode;
  description: string;
  laborMultiplier?: number;      // e.g. 1.15 = +15% labor
  laborHighMultiplier?: number;  // widens high-end only
  materialMultiplier?: number;
  confidenceDelta?: number;
  riskFlag?: string;
  returnTripRisk?: 'low' | 'medium' | 'high';
};

// ─── Assemblies ───

export type AssemblyCode = string;

export type Assembly = {
  code: AssemblyCode;
  description: string;
  tradeContext: string;
  laborHours: Range;
  materialCost: Range;
  components?: TaskComponentCode[];  // conceptual mapping, not required to sum
  validationStatus: ValidationStatus;
};

// ─── AI Extraction Output ───

export type DimensionEstimate = {
  value: number;
  unit: string;
  confidence: 'measured' | 'estimated_from_photo' | 'reported_by_customer';
};

export type ExtractedTask = {
  component: string;          // TaskComponentCode or unknown string
  quantity: number;
  quantityUnit?: string;
  complexity?: 'low' | 'standard' | 'high';
  confidence: number;
  source: 'observed' | 'inferred' | 'customer_reported';
  notes?: Record<string, string | number | boolean>;
};

export type ExtractionResult = {
  // Trade context (replaces rigid jobFamily for classification)
  tradeContexts: string[];

  // Assembly path: AI identifies if a known assembly matches
  assemblyCandidate: string | null;
  assemblyConfidence: number;

  // Component path: AI decomposes scope into task components
  tasks: ExtractedTask[];

  // Shared
  conditions: string[];
  unknowns: string[];
  materialSupplyStatus: MaterialSupplyStatus;
  overallConfidence: number;
  rawDescription: string;
};

// ─── Deterministic Estimator Output ───

export type BreakdownEntry = {
  code: string;
  description: string;
  deltaHours: number;
  deltaMaterialCost: number;
};

export type EstimatorOutput = {
  estimationPath: 'assembly' | 'component';
  assemblyUsed?: string;
  tradeContexts: string[];
  laborHours: Range;
  materialCost: Range;
  breakdown: BreakdownEntry[];
  riskFlags: string[];
  confidence: number;
  missingInputs: string[];
  estimatorVersion: string;
};

// ─── Baseline Types (kept for reference / backward compat) ───

export type ValidationStatus = 'needs_domain_validation';

export type JobClassification = {
  laborHours: Range;
  materialCost: Range;
  validationStatus: ValidationStatus;
};

export type AdjustmentRule = {
  code: string;
  description: string;
  factKey: string;
  match: boolean | string | number;
  deltaHoursExpected?: number;
  deltaHoursHigh?: number;
  deltaMaterialExpected?: number;
  deltaMaterialHigh?: number;
  confidenceDelta?: number;
  riskFlag?: string;
};

export type FamilyBaseline = {
  classifications: Record<string, JobClassification>;
  defaultClass: string;
  rules: AdjustmentRule[];
  validationStatus: ValidationStatus;
};

// ─── Business Economics Config (static owner settings) ───

export type BusinessEconomicsConfig = {
  businessId: string;
  ownerOpportunityRatePerHour: number;
  helperCashRatePerHour: number;
  mileageRate: number;
  materialMarkupPercent: number;
  minimumJobPrice: number;
  minimumHourlyRate: number;
  profitFloorAbsolute: number;
  marginFloorPercent: number;
  confidenceThreshold: number;
  weeklyEarningsGoal: number;
  weeklyCapacityHours: number;
};

// ─── Business Calibration (learned from completed-job actuals only) ───

export type BusinessCalibration = {
  businessId: string;
  projectFamily: string;        // trade context or assembly code
  laborMultiplier: number;
  materialMultiplier: number;
  sampleSize: number;
};

// ─── Pricing Floors ───

export type PricingFloors = {
  minimumJob: number;
  margin: number;
  absoluteProfit: number;
  laborProductivity: number;
  weeklyCapacityPace: number;
  binding: string;
};

// ─── EconomicJob (universal intermediate) ───

export type EconomicJob = {
  // Labor and capacity
  laborHours: Range;
  capacityHours: number;
  procurementHours: number;
  travelHours: number;
  returnTripHours: number;

  // Direct costs (cash out)
  materialCost: Range;
  travelCost: number;
  helperLaborCost: Range;
  totalDirectCost: Range;

  // Pricing
  estimatedQuoteRange: Range;
  minimumAcceptablePrice: number;
  recommendedQuote: number;
  evaluatedPrice: number;
  pricingFloors: PricingFloors;

  // Contribution profit (at evaluatedPrice minus direct cash costs)
  contributionProfit: Range;
  contributionMargin: Range;
  contributionPerLaborHour: Range;
  contributionPerCapacityHour: number;

  // Owner-adjusted (analytical only — not used in acceptance thresholds)
  ownerAdjustedProfit: Range;
  ownerAdjustedPerHour: Range;

  // Quality indicators
  confidence: number;
  riskFlags: string[];
  breakdown: BreakdownEntry[];
};

// ─── Decision Context (runtime, not persisted) ───

export type DecisionContext = {
  weeklyEarningsToDate: number;
  remainingCapacityHours: number;
  pipelineValue: number;
  pipelineHours: number;
  requiredContributionPerCapacityHour: number;
};

// ─── Estimation Run (immutable snapshot) ───

export type EstimationRun = {
  id: string;
  businessId: string;
  workId?: number;
  createdAt: string;
  projectFamily: string;
  estimatorVersion: string;
  aiModel: string;
  promptVersion: string;
  customerInputs: { description: string; photos: string[]; notes?: string };
  extraction: ExtractionResult;
  baselineEstimate: EstimatorOutput;
  calibrationApplied: { laborMultiplier: number; materialMultiplier: number; sampleSize: number } | null;
  economicJob: EconomicJob;
  decisionContext: DecisionContext;
  recommendation: Recommendation;
  reasons: ReasonItem[];
  confidence: number;
};

// ─── Human Adjustment (append-only) ───

export type AdjustmentEntry = {
  id: string;
  estimationRunId: string;
  businessId: string;
  userId: string;
  field: string;
  systemValue: number;
  previousValue: number;
  newValue: number;
  reasonCode: ReasonCode;
  reasonText?: string;
  createdAt: string;
};

// ─── Owner Decision (what the owner did with Rivet's recommendation) ───

export type OwnerAction = 'approved' | 'approved_adjusted' | 'declined' | 'reviewed_later';

/**
 * Situational snapshot at the moment the owner makes a decision.
 * Captures the "why did they decide this way?" context for future tuning.
 *
 * Example: Rivet said Pass on a $180 job. Owner took it anyway because it was
 * Thursday, he only needed $400 to hit his weekly goal, and he had 6 hours left.
 * Without this context, the feedback record just says "owner overrode Rivet" —
 * with it, we can learn "owners rationally override Pass when goal is nearly met."
 */
export type DecisionSnapshot = {
  // Time context
  dayOfWeek: number;             // 0=Sun … 6=Sat
  weekNumber: number;            // ISO week of year
  hourOfDay: number;             // 0-23 local time

  // Capacity context (at decision time, may differ from estimation time)
  remainingCapacityHours: number;
  hoursWorkedThisWeek: number;
  jobsCompletedThisWeek: number;

  // Financial context
  weeklyEarningsToDate: number;
  weeklyEarningsGoal: number;
  gapToWeeklyGoal: number;       // goal - earned (negative = already exceeded)
  requiredContributionPerCapacityHour: number;

  // Queue context
  queueDepth: number;            // how many other pending jobs
  queueTotalValue: number;       // sum of evaluated prices in queue
  queueTotalHours: number;       // sum of capacity hours in queue
};

export type OwnerDecision = {
  id: string;
  estimationRunId: string;
  businessId: string;
  userId: string;
  rivetRecommendation: Recommendation;
  ownerAction: OwnerAction;
  rivetPrice: number;          // Rivet's evaluatedPrice at decision time
  ownerPrice: number | null;   // price the owner set (null if declined)
  quotedPrice: number | null;  // price actually sent to customer (null if declined)
  reasonCode?: ReasonCode;
  reasonText?: string;
  decisionSnapshot: DecisionSnapshot;  // situational context at decision time
  decidedAt: string;
};

// ─── Actual Outcome ───

export type ActualOutcome = {
  id: string;
  estimationRunId: string;
  actualLaborHours: number;
  actualMaterialCost: number;
  actualProcurementHours: number;
  finalRevenue: number;
  returnTrips: number;
  quotedPrice?: number;        // what the customer was quoted
  recordedAt: string;
  notes?: string;
};

// ─── Feedback Record (complete 4-part loop) ───

export type FeedbackRecord = {
  estimationRunId: string;
  createdAt: string;
  projectFamily: string;
  // Part 1: Rivet's original estimate/recommendation
  rivet: {
    recommendation: Recommendation;
    confidence: number;
    evaluatedPrice: number;
    minimumAcceptablePrice: number;
    laborHours: Range;
    materialCost: Range;
    contributionProfit: Range;
    reasons: ReasonItem[];
  };
  // Part 2: What the handyman changed
  adjustments: AdjustmentEntry[];
  adjustedPrice: number | null;    // final price after all adjustments (null if none)
  // Part 3: Owner's decision and quoted price
  ownerDecision: OwnerDecision | null;
  quotedPrice: number | null;
  // Part 4: Actual outcome
  actual: {
    laborHours: number;
    materialCost: number;
    revenue: number;
    returnTrips: number;
  } | null;
  // Derived: who was closer?
  accuracy: {
    rivetLaborError: number | null;      // (rivet - actual) / actual
    adjustedLaborError: number | null;   // (adjusted - actual) / actual
    rivetPriceError: number | null;      // (rivetPrice - revenue) / revenue
    quotedPriceError: number | null;     // (quoted - revenue) / revenue
    rivetWasCloserOnLabor: boolean | null;
    rivetWasCloserOnPrice: boolean | null;
  } | null;
};

// ─── Helpers ───

export const ESTIMATOR_VERSION = '0.3.0';

export function defaultDecisionContext(): DecisionContext {
  return {
    weeklyEarningsToDate: 0,
    remainingCapacityHours: 0,
    pipelineValue: 0,
    pipelineHours: 0,
    requiredContributionPerCapacityHour: 0,
  };
}

export function defaultBusinessEconomicsConfig(businessId: string): BusinessEconomicsConfig {
  return {
    businessId,
    ownerOpportunityRatePerHour: 75,
    helperCashRatePerHour: 35,
    mileageRate: 0.67,
    materialMarkupPercent: 20,
    minimumJobPrice: 150,
    minimumHourlyRate: 75,
    profitFloorAbsolute: 50,
    marginFloorPercent: 35,
    confidenceThreshold: 0.70,
    weeklyEarningsGoal: 2500,
    weeklyCapacityHours: 35,
  };
}
