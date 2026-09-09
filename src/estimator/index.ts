// ─── Types ───
export type {
  HandymanJobFamily,
  ServiceVertical,
  Range,
  MaterialSupplyStatus,
  ReasonCode,
  Recommendation,
  ReasonItem,
  TaskComponentCode,
  TaskComponentDef,
  ConditionCode,
  ConditionModifierDef,
  AssemblyCode,
  Assembly,
  DimensionEstimate,
  ExtractedTask,
  ExtractionResult,
  BreakdownEntry,
  EstimatorOutput,
  ValidationStatus,
  JobClassification,
  AdjustmentRule,
  FamilyBaseline,
  BusinessEconomicsConfig,
  BusinessCalibration,
  EconomicJob,
  PricingFloors,
  DecisionContext,
  DecisionSnapshot,
  EstimationRun,
  AdjustmentEntry,
  ActualOutcome,
  OwnerAction,
  OwnerDecision,
  FeedbackRecord,
} from './types';

export {
  HANDYMAN_JOB_FAMILIES,
  ESTIMATOR_VERSION,
  defaultDecisionContext,
  defaultBusinessEconomicsConfig,
} from './types';

// ─── Task Components ───
export { TASK_COMPONENTS, KNOWN_COMPONENT_CODES } from './components';

// ─── Assemblies ───
export { ASSEMBLIES, ASSEMBLIES_BY_TRADE, KNOWN_ASSEMBLY_CODES, ASSEMBLY_CONFIDENCE_THRESHOLD } from './assemblies';

// ─── Condition Modifiers ───
export { CONDITION_MODIFIERS, KNOWN_CONDITION_CODES } from './modifiers';

// ─── Baselines (legacy reference) ───
export { BASELINES } from './baselines';

// ─── AI Extraction ───
export { extractJobFacts, extractJobFactsStub, EXTRACTION_PROMPT, EXTRACTION_SCHEMA, PROMPT_VERSION, AI_MODEL } from './extract';
export type { ExtractionInput } from './extract';

// ─── Estimator + Calibration ───
export { estimateHandymanJob, applyCalibration } from './estimator';

// ─── Decision Engine ───
export { deriveRecommendation } from './decision';
export type { DecisionResult } from './decision';

// ─── Diagnostics ───
export { summarizeDecisionLab } from './diagnostics';
export type { DecisionLabRecord, DecisionLabSummary } from './diagnostics';

// ─── Persistence ───
export {
  saveEstimationRun,
  getEstimationRun,
  getRunsForWork,
  saveAdjustment,
  getAdjustments,
  saveOutcome,
  getOutcome,
  compareEstimates,
  createAdjustmentEntry,
  saveOwnerDecision,
  getOwnerDecision,
  buildFeedbackRecord,
  buildFeedbackRecords,
} from './persistence';
