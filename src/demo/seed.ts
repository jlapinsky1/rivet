/**
 * Demo seed data for Mason Home Services.
 *
 * Every pending job is run through the REAL estimateHandymanJob + applyCalibration + deriveRecommendation
 * pipeline. Completed jobs use engine outputs with realistic actual outcomes layered on top.
 *
 * This file is imported at app startup — no network calls, no Supabase needed.
 */

import type {
  ExtractionResult,
  EstimatorOutput,
  EconomicJob,
  BusinessEconomicsConfig,
  DecisionContext,
  EstimationRun,
  AdjustmentEntry,
  ActualOutcome,
  Recommendation,
  ReasonCode,
} from '../estimator/types';
import type { WorkItem, OperationalStatus, BillingStatus, WorkSource, CustomerType } from '../admin/types';
import { ESTIMATOR_VERSION } from '../estimator/types';
import { estimateHandymanJob, applyCalibration } from '../estimator/estimator';
import { deriveRecommendation, type DecisionResult } from '../estimator/decision';
import { PROMPT_VERSION, AI_MODEL } from '../estimator/extract';

// ─── Business Config ───

export const DEMO_BUSINESS_ID = 'a0000000-0000-0000-0000-000000000001';

export const demoBusinessConfig: BusinessEconomicsConfig = {
  businessId: DEMO_BUSINESS_ID,
  ownerOpportunityRatePerHour: 75,
  helperCashRatePerHour: 30,
  mileageRate: 0.70,
  materialMarkupPercent: 20,
  minimumJobPrice: 175,
  minimumHourlyRate: 70,
  profitFloorAbsolute: 75,
  marginFloorPercent: 35,
  confidenceThreshold: 0.70,
  weeklyEarningsGoal: 2500,
  weeklyCapacityHours: 35,
};

// ─── Decision Context — a realistic Tuesday mid-week snapshot ───

const demoDecisionContext: DecisionContext = {
  weeklyEarningsToDate: 875,
  remainingCapacityHours: 22,
  pipelineValue: 3200,
  pipelineHours: 28,
  requiredContributionPerCapacityHour: 74,
};

// ─── Stock Photos ───

const PHOTOS = {
  drywall: [
    'https://images.pexels.com/photos/5691550/pexels-photo-5691550.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    'https://images.pexels.com/photos/3615723/pexels-photo-3615723.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  ],
  exterior: [
    'https://images.pexels.com/photos/10847167/pexels-photo-10847167.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    'https://images.pexels.com/photos/7601167/pexels-photo-7601167.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  ],
  deck: [
    'https://images.pexels.com/photos/36220309/pexels-photo-36220309.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    'https://images.pexels.com/photos/10847167/pexels-photo-10847167.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  ],
  fence: [
    'https://images.pexels.com/photos/11903184/pexels-photo-11903184.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    'https://images.pexels.com/photos/36909374/pexels-photo-36909374.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  ],
  interior: [
    'https://images.pexels.com/photos/19109111/pexels-photo-19109111.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
    'https://images.pexels.com/photos/10117716/pexels-photo-10117716.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  ],
  tv: [
    'https://images.pexels.com/photos/5691550/pexels-photo-5691550.jpeg?auto=compress&cs=tinysrgb&h=650&w=940',
  ],
};

// ─── Helper: run full pipeline ───

type PipelineResult = {
  extraction: ExtractionResult;
  estimate: EstimatorOutput;
  economicJob: EconomicJob;
  decision: DecisionResult;
};

function runPipeline(extraction: ExtractionResult, travelMiles: number): PipelineResult {
  const estimate = estimateHandymanJob(extraction);
  const economicJob = applyCalibration(estimate, demoBusinessConfig, null, travelMiles, demoDecisionContext);
  const decision = deriveRecommendation(economicJob, demoBusinessConfig, demoDecisionContext);
  return { extraction, estimate, economicJob, decision };
}

// ─── Helper: build EstimationRun ───

let runCounter = 0;
function makeRunId(): string {
  runCounter++;
  return `demo-run-${String(runCounter).padStart(3, '0')}`;
}

function buildRun(
  pipeline: PipelineResult,
  opts: { createdAt: string; workId: number; projectFamily: string },
): EstimationRun {
  return {
    id: makeRunId(),
    businessId: DEMO_BUSINESS_ID,
    workId: opts.workId,
    createdAt: opts.createdAt,
    projectFamily: opts.projectFamily,
    estimatorVersion: ESTIMATOR_VERSION,
    aiModel: AI_MODEL,
    promptVersion: PROMPT_VERSION,
    customerInputs: { description: pipeline.extraction.rawDescription, photos: [] },
    extraction: pipeline.extraction,
    baselineEstimate: pipeline.estimate,
    calibrationApplied: null,
    economicJob: pipeline.economicJob,
    decisionContext: demoDecisionContext,
    recommendation: pipeline.decision.recommendation,
    reasons: pipeline.decision.reasons,
    confidence: pipeline.economicJob.confidence,
  };
}

// ─── Helper: build WorkItem from pipeline ───

function buildWorkItem(
  id: number,
  title: string,
  pipeline: PipelineResult,
  opts: {
    customerName: string;
    customerSub?: string;
    customerType?: CustomerType;
    location: string;
    travel: string;
    description: string;
    photos: string[];
    opStatus: OperationalStatus;
    billingStatus: BillingStatus;
    source?: WorkSource;
    phone?: string;
    email?: string;
    address?: string;
    preferredDate?: string;
    customerNotes?: string;
    companyName?: string;
    propertyName?: string;
    unitLabel?: string;
    workOrderNumber?: string;
    requestedBy?: string;
    requestedByRole?: string;
    requestedDate?: string;
    scope?: string;
    serviceType?: string;
    estimationRunId?: string;
  },
): WorkItem {
  const econ = pipeline.economicJob;
  const profit = Math.round(econ.contributionProfit.expected);
  const hours = econ.laborHours;
  const hoursStr = hours.low === hours.high
    ? `${hours.expected.toFixed(0)} hrs`
    : `${hours.low.toFixed(0)}–${hours.high.toFixed(0)} hrs`;
  const rateNum = econ.ownerAdjustedPerHour.expected;
  return {
    id,
    title,
    source: opts.source ?? 'customer_request',
    customerType: opts.customerType ?? 'individual',
    customerName: opts.customerName,
    customerSub: opts.customerSub,
    location: opts.location,
    travel: opts.travel,
    profit,
    hours: hoursStr,
    hoursNum: hours.expected,
    rate: `$${Math.round(rateNum)}/hr`,
    rateNum: Math.round(rateNum),
    recommendation: pipeline.decision.recommendation,
    confidence: Math.round(econ.confidence * 100),
    description: opts.description,
    price: Math.round(econ.suggestedPrice.expected),
    costs: Math.round(econ.totalDirectCost.expected),
    costBreakdown: [
      { label: 'Materials', value: `$${Math.round(econ.materialCost.expected)}` },
      { label: 'Travel', value: `$${Math.round(econ.travelCost)}` },
    ],
    reasons: pipeline.decision.reasons,
    photos: opts.photos,
    opStatus: opts.opStatus,
    billingStatus: opts.billingStatus,
    phone: opts.phone,
    email: opts.email,
    address: opts.address,
    preferredDate: opts.preferredDate,
    customerNotes: opts.customerNotes,
    companyName: opts.companyName,
    propertyName: opts.propertyName,
    unitLabel: opts.unitLabel,
    workOrderNumber: opts.workOrderNumber,
    requestedBy: opts.requestedBy,
    requestedByRole: opts.requestedByRole,
    requestedDate: opts.requestedDate,
    scope: opts.scope,
    serviceType: opts.serviceType ?? 'Handyman',
    estimationRunId: opts.estimationRunId,
  };
}

// ─── Helper: adjustments ───

let adjCounter = 0;
function makeAdj(
  runId: string,
  field: string,
  systemValue: number,
  previousValue: number,
  newValue: number,
  reasonCode: ReasonCode,
  createdAt: string,
  reasonText?: string,
): AdjustmentEntry {
  adjCounter++;
  return {
    id: `demo-adj-${String(adjCounter).padStart(3, '0')}`,
    estimationRunId: runId,
    businessId: DEMO_BUSINESS_ID,
    userId: 'mason-owner',
    field,
    systemValue,
    previousValue,
    newValue,
    reasonCode,
    reasonText,
    createdAt,
  };
}

// ─── Helper: outcomes ───

let outcomeCounter = 0;
function makeOutcome(
  runId: string,
  actual: { laborHours: number; materialCost: number; procurementHours: number; revenue: number; returnTrips: number; notes?: string },
  recordedAt: string,
): ActualOutcome {
  outcomeCounter++;
  return {
    id: `demo-outcome-${String(outcomeCounter).padStart(3, '0')}`,
    estimationRunId: runId,
    actualLaborHours: actual.laborHours,
    actualMaterialCost: actual.materialCost,
    actualProcurementHours: actual.procurementHours,
    finalRevenue: actual.revenue,
    returnTrips: actual.returnTrips,
    recordedAt,
    notes: actual.notes,
  };
}

// ═══════════════════════════════════════════════════════════════
// PENDING JOBS (10) — run through real engine
// ═══════════════════════════════════════════════════════════════

// 1. Straightforward TAKE — small drywall patch
const extraction1: ExtractionResult = {
  tradeContexts: ['drywall_repair'],
  assemblyCandidate: 'SMALL_DRYWALL_PATCH',
  assemblyConfidence: 0.92,
  tasks: [
    { component: 'protect_work_area', quantity: 1, complexity: 'low', confidence: 0.95, source: 'inferred' },
    { component: 'patch_surface', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'observed' },
    { component: 'tape_and_mud', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
    { component: 'sand_and_finish', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
    { component: 'paint_or_touchup', quantity: 1, complexity: 'low', confidence: 0.85, source: 'customer_reported' },
  ],
  conditions: [],
  unknowns: [],
  materialSupplyStatus: 'contractor_supplied',
  overallConfidence: 0.90,
  rawDescription: 'Small hole in bedroom drywall from moving furniture. About the size of a softball. We have matching paint.',
};
const pipeline1 = runPipeline(extraction1, 8);

// 2. TAKE — standard TV mount (customer supplied mount)
const extraction2: ExtractionResult = {
  tradeContexts: ['tv_wall_mounting'],
  assemblyCandidate: 'STANDARD_TV_MOUNT',
  assemblyConfidence: 0.88,
  tasks: [
    { component: 'measure_and_layout', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
    { component: 'fasten_or_anchor', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
    { component: 'mount_object', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'customer_reported' },
  ],
  conditions: ['customer_supplied_material'],
  unknowns: ['stud_location_behind_drywall'],
  materialSupplyStatus: 'customer_supplied',
  overallConfidence: 0.82,
  rawDescription: 'Mount a 65 inch TV in living room. Standard drywall wall. I already have the mount.',
};
const pipeline2 = runPipeline(extraction2, 10);

// 3. REVIEW — exterior door replacement with frame concern
const extraction3: ExtractionResult = {
  tradeContexts: ['exterior_door_replacement'],
  assemblyCandidate: 'STANDARD_EXTERIOR_DOOR',
  assemblyConfidence: 0.78,
  tasks: [
    { component: 'remove_existing_material', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'observed' },
    { component: 'replace_fixture', quantity: 1, complexity: 'high', confidence: 0.75, source: 'customer_reported', notes: { fixtureType: 'exterior_door' } },
    { component: 'install_board_or_trim', quantity: 1, complexity: 'standard', confidence: 0.70, source: 'inferred' },
    { component: 'seal_or_caulk', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'inferred' },
  ],
  conditions: ['unknown_substrate'],
  unknowns: ['frame_condition', 'threshold_condition', 'weatherstripping_type'],
  materialSupplyStatus: 'customer_supplied',
  overallConfidence: 0.68,
  rawDescription: 'Need old back door replaced. New door is already here. Bottom of frame looks a little rough.',
};
const pipeline3 = runPipeline(extraction3, 14);

// 4. REVIEW — water damaged ceiling drywall
const extraction4: ExtractionResult = {
  tradeContexts: ['drywall_repair'],
  assemblyCandidate: 'DRYWALL_SECTION_REPLACEMENT',
  assemblyConfidence: 0.72, // below threshold — will use component path
  tasks: [
    { component: 'protect_work_area', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
    { component: 'demolition_light', quantity: 1, complexity: 'high', confidence: 0.65, source: 'inferred' },
    { component: 'install_sheet_material', quantity: 1, complexity: 'high', confidence: 0.60, source: 'inferred' },
    { component: 'tape_and_mud', quantity: 1, complexity: 'standard', confidence: 0.70, source: 'inferred' },
    { component: 'sand_and_finish', quantity: 1, complexity: 'standard', confidence: 0.70, source: 'inferred' },
    { component: 'paint_or_touchup', quantity: 1, complexity: 'standard', confidence: 0.65, source: 'inferred' },
  ],
  conditions: ['overhead_work', 'water_damage', 'multiple_visits_required'],
  unknowns: ['extent_of_water_damage', 'insulation_condition', 'source_of_leak_resolved'],
  materialSupplyStatus: 'contractor_supplied',
  overallConfidence: 0.55,
  rawDescription: 'Ceiling has a brown spot and drywall is soft after an upstairs leak.',
};
const pipeline4 = runPipeline(extraction4, 12);

// 5. PASS — tiny job with long travel
const extraction5: ExtractionResult = {
  tradeContexts: ['general_handyman'],
  assemblyCandidate: null,
  assemblyConfidence: 0,
  tasks: [
    { component: 'replace_fixture', quantity: 1, complexity: 'low', confidence: 0.90, source: 'customer_reported' },
    { component: 'mount_object', quantity: 2, complexity: 'low', confidence: 0.85, source: 'customer_reported' },
  ],
  conditions: [],
  unknowns: [],
  materialSupplyStatus: 'unknown',
  overallConfidence: 0.80,
  rawDescription: 'Replace one cabinet knob and hang two small pictures.',
};
const pipeline5 = runPipeline(extraction5, 28); // 28 miles = long travel

// 6. Component path — dog damage stair repair
const extraction6: ExtractionResult = {
  tradeContexts: ['finish_carpentry'],
  assemblyCandidate: null,
  assemblyConfidence: 0,
  tasks: [
    { component: 'remove_existing_material', quantity: 2, complexity: 'standard', confidence: 0.80, source: 'observed' },
    { component: 'repair_railing', quantity: 2, complexity: 'high', confidence: 0.70, source: 'observed', notes: { chewedBalusters: true } },
    { component: 'install_board_or_trim', quantity: 1, complexity: 'standard', confidence: 0.75, source: 'observed' },
    { component: 'sand_and_finish', quantity: 1, complexity: 'standard', confidence: 0.70, source: 'inferred' },
    { component: 'paint_or_touchup', quantity: 1, complexity: 'standard', confidence: 0.70, source: 'inferred' },
  ],
  conditions: ['finish_matching'],
  unknowns: ['exact_trim_profile', 'stain_vs_paint'],
  materialSupplyStatus: 'contractor_supplied',
  overallConfidence: 0.65,
  rawDescription: 'Dog damaged the stair trim and chewed two balusters. Need repaired and touched up.',
};
const pipeline6 = runPipeline(extraction6, 11);

// 7. Component path — cabinet bottom + caulk
const extraction7: ExtractionResult = {
  tradeContexts: ['carpentry', 'minor_plumbing'],
  assemblyCandidate: null,
  assemblyConfidence: 0,
  tasks: [
    { component: 'remove_existing_material', quantity: 1, complexity: 'standard', confidence: 0.80, source: 'inferred' },
    { component: 'cut_and_fit_material', quantity: 1, complexity: 'high', confidence: 0.70, source: 'inferred' },
    { component: 'install_sheet_material', quantity: 1, complexity: 'standard', confidence: 0.70, source: 'inferred' },
    { component: 'seal_or_caulk', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'customer_reported' },
  ],
  conditions: ['confined_access', 'water_damage'],
  unknowns: ['extent_of_water_damage_under_sink', 'cabinet_material_type'],
  materialSupplyStatus: 'contractor_supplied',
  overallConfidence: 0.60,
  rawDescription: 'Replace damaged cabinet bottom under kitchen sink and recaulk around sink.',
};
const pipeline7 = runPipeline(extraction7, 9);

// 8. TAKE — fence post reset (3 posts)
const extraction8: ExtractionResult = {
  tradeContexts: ['fence_repair'],
  assemblyCandidate: 'FENCE_POST_RESET',
  assemblyConfidence: 0.88,
  tasks: [
    { component: 'demolition_light', quantity: 3, complexity: 'standard', confidence: 0.85, source: 'observed' },
    { component: 'set_post', quantity: 3, complexity: 'standard', confidence: 0.85, source: 'observed' },
    { component: 'fasten_or_anchor', quantity: 3, complexity: 'standard', confidence: 0.85, source: 'inferred' },
  ],
  conditions: [],
  unknowns: ['below_grade_condition'],
  materialSupplyStatus: 'contractor_supplied',
  overallConfidence: 0.82,
  rawDescription: 'Three fence posts leaning badly after the storms. Need them reset with new concrete.',
};
const pipeline8 = runPipeline(extraction8, 7);

// 9. TAKE — deck board replacement
const extraction9: ExtractionResult = {
  tradeContexts: ['deck_repair'],
  assemblyCandidate: 'DECK_BOARD_REPLACEMENT',
  assemblyConfidence: 0.85,
  tasks: [
    { component: 'remove_existing_material', quantity: 6, complexity: 'standard', confidence: 0.85, source: 'observed' },
    { component: 'measure_and_layout', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
    { component: 'cut_and_fit_material', quantity: 6, complexity: 'standard', confidence: 0.85, source: 'inferred' },
    { component: 'install_decking', quantity: 6, complexity: 'standard', confidence: 0.85, source: 'inferred' },
  ],
  conditions: [],
  unknowns: ['joist_condition_under_boards'],
  materialSupplyStatus: 'contractor_supplied',
  overallConfidence: 0.80,
  rawDescription: 'About 6 rotted deck boards on the back porch. The rest of the deck looks fine.',
};
const pipeline9 = runPipeline(extraction9, 15);

// 10. REVIEW — commercial work order, medium drywall
const extraction10: ExtractionResult = {
  tradeContexts: ['drywall_repair'],
  assemblyCandidate: 'MEDIUM_DRYWALL_PATCH',
  assemblyConfidence: 0.82,
  tasks: [
    { component: 'protect_work_area', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
    { component: 'remove_existing_material', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'inferred' },
    { component: 'install_sheet_material', quantity: 1, complexity: 'standard', confidence: 0.80, source: 'inferred' },
    { component: 'tape_and_mud', quantity: 2, complexity: 'standard', confidence: 0.85, source: 'inferred' },
    { component: 'sand_and_finish', quantity: 2, complexity: 'standard', confidence: 0.85, source: 'inferred' },
    { component: 'paint_or_touchup', quantity: 2, complexity: 'standard', confidence: 0.80, source: 'inferred' },
  ],
  conditions: ['occupied_workspace'],
  unknowns: ['behind_wall_condition'],
  materialSupplyStatus: 'contractor_supplied',
  overallConfidence: 0.78,
  rawDescription: 'Two medium drywall holes in hallway of Unit 4B. Looks like furniture damage. Need patched and painted to match.',
};
const pipeline10 = runPipeline(extraction10, 18);

// Build pending WorkItems
const pendingWorkItems: WorkItem[] = [
  buildWorkItem(1001, 'Small drywall patch — bedroom', pipeline1, {
    customerName: 'Karen Mitchell', location: 'Nashville, TN', travel: '8 min',
    description: extraction1.rawDescription, photos: PHOTOS.drywall,
    opStatus: 'needs_review', billingStatus: 'not_invoiced',
    phone: '(615) 555-0134', email: 'karen.m@email.com', address: '214 Maple Ridge Dr, Nashville, TN',
    preferredDate: 'Sept 12',
  }),
  buildWorkItem(1002, 'Mount 65" TV — living room', pipeline2, {
    customerName: 'Derek Nguyen', location: 'Nashville, TN', travel: '10 min',
    description: extraction2.rawDescription, photos: PHOTOS.tv,
    opStatus: 'needs_review', billingStatus: 'not_invoiced',
    phone: '(615) 555-0156', email: 'derek.n@email.com', address: '309 Woodland St, Nashville, TN',
    customerNotes: 'I already have the mount and all hardware.',
  }),
  buildWorkItem(1003, 'Replace back door', pipeline3, {
    customerName: 'Angela Reeves', location: 'Nashville, TN', travel: '14 min',
    description: extraction3.rawDescription, photos: PHOTOS.exterior,
    opStatus: 'needs_review', billingStatus: 'not_invoiced',
    phone: '(615) 555-0212', email: 'angela.r@email.com', address: '1401 Belmont Blvd, Nashville, TN',
    customerNotes: 'Door is in the garage ready to go.',
  }),
  buildWorkItem(1004, 'Water-damaged ceiling drywall', pipeline4, {
    customerName: 'Marcus Coleman', location: 'Nashville, TN', travel: '12 min',
    description: extraction4.rawDescription, photos: PHOTOS.drywall,
    opStatus: 'needs_review', billingStatus: 'not_invoiced',
    phone: '(615) 555-0341', email: 'marcus.coleman@email.com', address: '555 Eastland Ave, Nashville, TN',
    customerNotes: 'Plumber already fixed the upstairs leak.',
  }),
  buildWorkItem(1005, 'Replace cabinet knob + hang pictures', pipeline5, {
    customerName: 'Greg Patterson', location: 'Murfreesboro, TN', travel: '35 min',
    description: extraction5.rawDescription, photos: PHOTOS.interior,
    opStatus: 'needs_review', billingStatus: 'not_invoiced',
    phone: '(615) 555-0144', email: 'gpatt@email.com', address: '891 Dickerson Pike, Nashville, TN',
  }),
  buildWorkItem(1006, 'Stair trim + baluster repair (dog damage)', pipeline6, {
    customerName: 'Stacy Caldwell', location: 'Nashville, TN', travel: '11 min',
    description: extraction6.rawDescription, photos: PHOTOS.interior,
    opStatus: 'needs_review', billingStatus: 'not_invoiced',
    phone: '(615) 555-0298', email: 'stacy.c@email.com', address: '72 Hillsboro Pike, Nashville, TN',
    customerNotes: 'Lab mix chewed two spindles and scratched the trim on the first 3 stairs.',
  }),
  buildWorkItem(1007, 'Kitchen sink cabinet bottom + recaulk', pipeline7, {
    customerName: 'Lisa Chen', location: 'Nashville, TN', travel: '9 min',
    description: extraction7.rawDescription, photos: PHOTOS.interior,
    opStatus: 'needs_review', billingStatus: 'not_invoiced',
    phone: '(615) 555-0177', email: 'lisa.chen@email.com', address: '1825 West End Ave, Nashville, TN',
  }),
  buildWorkItem(1008, 'Reset 3 fence posts', pipeline8, {
    customerName: 'Brian Hargrove', location: 'Nashville, TN', travel: '7 min',
    description: extraction8.rawDescription, photos: PHOTOS.fence,
    opStatus: 'quoted', billingStatus: 'not_invoiced',
    phone: '(615) 555-0423', email: 'bhargrove@email.com', address: '402 Shelby Ave, Nashville, TN',
  }),
  buildWorkItem(1009, 'Replace 6 rotted deck boards', pipeline9, {
    customerName: 'Yolanda Freeman', location: 'Nashville, TN', travel: '15 min',
    description: extraction9.rawDescription, photos: PHOTOS.deck,
    opStatus: 'scheduled', billingStatus: 'deposit_pending',
    phone: '(615) 555-0478', email: 'yfreeman@email.com', address: '3310 Charlotte Ave, Nashville, TN',
    preferredDate: 'Sept 14',
  }),
  buildWorkItem(1010, 'Patch hallway drywall — Unit 4B', pipeline10, {
    customerName: 'Greenway Property Management', customerSub: 'Riverside Commons · Unit 4B',
    customerType: 'organization', source: 'commercial_work_order',
    location: 'Nashville, TN', travel: '18 min',
    description: extraction10.rawDescription, photos: PHOTOS.drywall,
    opStatus: 'needs_review', billingStatus: 'not_invoiced',
    companyName: 'Greenway Property Management', propertyName: 'Riverside Commons',
    unitLabel: 'Unit 4B', workOrderNumber: '#GW-2089',
    requestedBy: 'David Chen', requestedByRole: 'Maintenance Director', requestedDate: 'September 9',
    scope: extraction10.rawDescription,
  }),
];

// Build pending EstimationRuns
const pendingRuns: EstimationRun[] = [
  buildRun(pipeline1, { createdAt: '2026-09-09T08:12:00Z', workId: 1001, projectFamily: 'drywall_repair' }),
  buildRun(pipeline2, { createdAt: '2026-09-09T08:25:00Z', workId: 1002, projectFamily: 'tv_wall_mounting' }),
  buildRun(pipeline3, { createdAt: '2026-09-08T14:30:00Z', workId: 1003, projectFamily: 'exterior_door_replacement' }),
  buildRun(pipeline4, { createdAt: '2026-09-08T16:45:00Z', workId: 1004, projectFamily: 'drywall_repair' }),
  buildRun(pipeline5, { createdAt: '2026-09-09T07:00:00Z', workId: 1005, projectFamily: 'general_handyman' }),
  buildRun(pipeline6, { createdAt: '2026-09-08T10:15:00Z', workId: 1006, projectFamily: 'finish_carpentry' }),
  buildRun(pipeline7, { createdAt: '2026-09-07T15:00:00Z', workId: 1007, projectFamily: 'carpentry' }),
  buildRun(pipeline8, { createdAt: '2026-09-06T09:30:00Z', workId: 1008, projectFamily: 'fence_repair' }),
  buildRun(pipeline9, { createdAt: '2026-09-05T11:00:00Z', workId: 1009, projectFamily: 'deck_repair' }),
  buildRun(pipeline10, { createdAt: '2026-09-09T09:15:00Z', workId: 1010, projectFamily: 'drywall_repair' }),
];

// ═══════════════════════════════════════════════════════════════
// COMPLETED JOBS (12) — with actual outcomes
// ═══════════════════════════════════════════════════════════════

// A. Rivet was accurate — small drywall patch
const cExtract1: ExtractionResult = {
  tradeContexts: ['drywall_repair'], assemblyCandidate: 'SMALL_DRYWALL_PATCH', assemblyConfidence: 0.90,
  tasks: [
    { component: 'patch_surface', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'observed' },
    { component: 'tape_and_mud', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
    { component: 'sand_and_finish', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
    { component: 'paint_or_touchup', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'inferred' },
  ],
  conditions: [], unknowns: [],
  materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.88,
  rawDescription: 'Small nail pop and drywall crack in hallway. About 8 inches long.',
};
const cPipe1 = runPipeline(cExtract1, 6);
const cRun1 = buildRun(cPipe1, { createdAt: '2026-08-15T10:00:00Z', workId: 2001, projectFamily: 'drywall_repair' });
const cOutcome1 = makeOutcome(cRun1.id, { laborHours: 1.6, materialCost: 28, procurementHours: 0.5, revenue: Math.round(cPipe1.economicJob.suggestedPrice.expected), returnTrips: 0 }, '2026-08-16T17:00:00Z');

// B. Human correction was better — TV mount above fireplace
const cExtract2: ExtractionResult = {
  tradeContexts: ['tv_wall_mounting'], assemblyCandidate: 'TV_MOUNT_ABOVE_FIREPLACE', assemblyConfidence: 0.85,
  tasks: [
    { component: 'measure_and_layout', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'inferred' },
    { component: 'fasten_or_anchor', quantity: 1, complexity: 'high', confidence: 0.80, source: 'inferred' },
    { component: 'mount_object', quantity: 1, complexity: 'high', confidence: 0.80, source: 'customer_reported' },
  ],
  conditions: ['second_floor_access'], unknowns: ['stud_spacing_above_fireplace', 'mantle_clearance'],
  materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.75,
  rawDescription: 'Mount 75 inch TV above stone fireplace. High ceilings. Need to figure out the stud situation.',
};
const cPipe2 = runPipeline(cExtract2, 12);
const cRun2 = buildRun(cPipe2, { createdAt: '2026-08-18T09:00:00Z', workId: 2002, projectFamily: 'tv_wall_mounting' });
// Human adjusted labor from system expected → 3.5h because of stone fireplace difficulty
const cAdj2: AdjustmentEntry[] = [
  makeAdj(cRun2.id, 'laborHours', cPipe2.economicJob.laborHours.expected, cPipe2.economicJob.laborHours.expected, 3.5, 'OWNER_EXPERIENCE', '2026-08-18T09:30:00Z', 'Stone fireplace always takes longer'),
];
const cOutcome2 = makeOutcome(cRun2.id, { laborHours: 3.2, materialCost: 55, procurementHours: 0.75, revenue: 380, returnTrips: 0 }, '2026-08-19T16:00:00Z');

// C. Human correction was worse — fence post reset
const cExtract3: ExtractionResult = {
  tradeContexts: ['fence_repair'], assemblyCandidate: 'FENCE_POST_RESET', assemblyConfidence: 0.90,
  tasks: [
    { component: 'demolition_light', quantity: 2, complexity: 'standard', confidence: 0.85, source: 'observed' },
    { component: 'set_post', quantity: 2, complexity: 'standard', confidence: 0.85, source: 'observed' },
  ],
  conditions: [], unknowns: ['below_grade_condition'],
  materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.85,
  rawDescription: 'Two fence posts leaning after last month storm. Need straightened and re-concreted.',
};
const cPipe3 = runPipeline(cExtract3, 10);
const cRun3 = buildRun(cPipe3, { createdAt: '2026-08-20T11:00:00Z', workId: 2003, projectFamily: 'fence_repair' });
// Human over-adjusted — thought ground would be rocky. System was closer.
const cAdj3: AdjustmentEntry[] = [
  makeAdj(cRun3.id, 'laborHours', cPipe3.economicJob.laborHours.expected, cPipe3.economicJob.laborHours.expected, 5.5, 'SITE_CONDITION_DIFFERENT', '2026-08-20T11:20:00Z', 'Customer says very rocky soil'),
];
const cOutcome3 = makeOutcome(cRun3.id, { laborHours: 3.8, materialCost: 52, procurementHours: 0.5, revenue: 340, returnTrips: 0 }, '2026-08-21T15:00:00Z');

// D. Both missed — hidden rot discovered after trim removal
const cExtract4: ExtractionResult = {
  tradeContexts: ['finish_carpentry'], assemblyCandidate: null, assemblyConfidence: 0,
  tasks: [
    { component: 'remove_existing_material', quantity: 1, complexity: 'standard', confidence: 0.80, source: 'observed' },
    { component: 'install_board_or_trim', quantity: 3, quantity_unit: 'linear_ft', complexity: 'standard', confidence: 0.75, source: 'observed' } as any,
    { component: 'paint_or_touchup', quantity: 1, complexity: 'standard', confidence: 0.75, source: 'inferred' },
  ],
  conditions: [], unknowns: ['behind_trim_condition'],
  materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.70,
  rawDescription: 'Bathroom door trim is splitting and pulling away. Needs replaced and repainted.',
};
const cPipe4 = runPipeline(cExtract4, 8);
const cRun4 = buildRun(cPipe4, { createdAt: '2026-08-22T08:00:00Z', workId: 2004, projectFamily: 'finish_carpentry' });
const cAdj4: AdjustmentEntry[] = [
  makeAdj(cRun4.id, 'laborHours', cPipe4.economicJob.laborHours.expected, cPipe4.economicJob.laborHours.expected, cPipe4.economicJob.laborHours.expected + 0.5, 'OWNER_EXPERIENCE', '2026-08-22T08:15:00Z', 'Old house, trim usually fights back'),
];
const cOutcome4 = makeOutcome(cRun4.id, {
  laborHours: 6.5, materialCost: 145, procurementHours: 1.5, revenue: 520, returnTrips: 1,
  notes: 'Hidden rot discovered after removing trim. Had to replace studs and blocking behind wall. Return trip for materials.',
}, '2026-08-24T17:00:00Z');

// E. Material estimate miss — deck board replacement
const cExtract5: ExtractionResult = {
  tradeContexts: ['deck_repair'], assemblyCandidate: 'DECK_BOARD_REPLACEMENT', assemblyConfidence: 0.86,
  tasks: [
    { component: 'remove_existing_material', quantity: 8, complexity: 'standard', confidence: 0.85, source: 'observed' },
    { component: 'cut_and_fit_material', quantity: 8, complexity: 'standard', confidence: 0.80, source: 'inferred' },
    { component: 'install_decking', quantity: 8, complexity: 'standard', confidence: 0.80, source: 'inferred' },
  ],
  conditions: [], unknowns: ['joist_condition'],
  materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.80,
  rawDescription: 'Eight rotted deck boards near the grill area. Composite decking to match existing.',
};
const cPipe5 = runPipeline(cExtract5, 13);
const cRun5 = buildRun(cPipe5, { createdAt: '2026-08-25T09:00:00Z', workId: 2005, projectFamily: 'deck_repair' });
const cAdj5: AdjustmentEntry[] = [
  makeAdj(cRun5.id, 'materialCost', cPipe5.economicJob.materialCost.expected, cPipe5.economicJob.materialCost.expected, 180, 'MATERIAL_COST_DIFFERENT', '2026-08-25T09:20:00Z', 'Composite decking is pricier than standard'),
];
const cOutcome5 = makeOutcome(cRun5.id, {
  laborHours: 5.5, materialCost: 285, procurementHours: 1.0, revenue: 680, returnTrips: 0,
  notes: 'Composite decking was $35/board vs expected $20. Total material much higher than estimated.',
}, '2026-08-26T16:00:00Z');

// F. Return trip miss — drywall paint job needed second visit
const cExtract6: ExtractionResult = {
  tradeContexts: ['drywall_repair'], assemblyCandidate: 'MEDIUM_DRYWALL_PATCH', assemblyConfidence: 0.84,
  tasks: [
    { component: 'protect_work_area', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
    { component: 'patch_surface', quantity: 2, complexity: 'standard', confidence: 0.85, source: 'observed' },
    { component: 'tape_and_mud', quantity: 2, complexity: 'standard', confidence: 0.85, source: 'inferred' },
    { component: 'sand_and_finish', quantity: 2, complexity: 'standard', confidence: 0.85, source: 'inferred' },
    { component: 'paint_or_touchup', quantity: 2, complexity: 'standard', confidence: 0.80, source: 'inferred' },
  ],
  conditions: ['finish_matching'], unknowns: ['paint_color_match'],
  materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.78,
  rawDescription: 'Two medium holes in kids room. Need smooth finish and paint to match existing walls.',
};
const cPipe6 = runPipeline(cExtract6, 9);
const cRun6 = buildRun(cPipe6, { createdAt: '2026-08-27T10:00:00Z', workId: 2006, projectFamily: 'drywall_repair' });
const cOutcome6 = makeOutcome(cRun6.id, {
  laborHours: 4.5, materialCost: 65, procurementHours: 1.0, revenue: 420, returnTrips: 1,
  notes: 'First coat of mud needed 24h to dry. Had to return next day for second coat, sand, and paint. Rivet underestimated the visits.',
}, '2026-08-29T15:00:00Z');

// G. Accurate — standard exterior door
const cExtract7: ExtractionResult = {
  tradeContexts: ['exterior_door_replacement'], assemblyCandidate: 'STANDARD_EXTERIOR_DOOR', assemblyConfidence: 0.90,
  tasks: [
    { component: 'remove_existing_material', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
    { component: 'replace_fixture', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'customer_reported' },
    { component: 'install_board_or_trim', quantity: 1, complexity: 'standard', confidence: 0.80, source: 'inferred' },
    { component: 'seal_or_caulk', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'inferred' },
  ],
  conditions: [], unknowns: ['frame_condition'],
  materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.82,
  rawDescription: 'Front door doesn\'t seal well anymore. Want to replace with new pre-hung from Home Depot.',
};
const cPipe7 = runPipeline(cExtract7, 11);
const cRun7 = buildRun(cPipe7, { createdAt: '2026-08-30T08:00:00Z', workId: 2007, projectFamily: 'exterior_door_replacement' });
const cOutcome7 = makeOutcome(cRun7.id, { laborHours: 5.8, materialCost: 118, procurementHours: 0.75, revenue: Math.round(cPipe7.economicJob.suggestedPrice.expected), returnTrips: 0 }, '2026-08-30T17:00:00Z');

// H. Multiple adjustments — medium drywall with scope change
const cExtract8: ExtractionResult = {
  tradeContexts: ['drywall_repair'], assemblyCandidate: 'MEDIUM_DRYWALL_PATCH', assemblyConfidence: 0.85,
  tasks: [
    { component: 'protect_work_area', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
    { component: 'remove_existing_material', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'inferred' },
    { component: 'install_sheet_material', quantity: 1, complexity: 'standard', confidence: 0.80, source: 'inferred' },
    { component: 'tape_and_mud', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'inferred' },
    { component: 'sand_and_finish', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'inferred' },
    { component: 'paint_or_touchup', quantity: 1, complexity: 'standard', confidence: 0.80, source: 'inferred' },
  ],
  conditions: [], unknowns: ['behind_wall_condition'],
  materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.80,
  rawDescription: 'Medium hole behind bedroom door from doorknob. About 14 inches. Need smooth wall finish.',
};
const cPipe8 = runPipeline(cExtract8, 7);
const cRun8 = buildRun(cPipe8, { createdAt: '2026-09-01T09:00:00Z', workId: 2008, projectFamily: 'drywall_repair' });
// Multiple adjustments — owner adjusted labor, then price, then again after site visit
const sysLabor8 = cPipe8.economicJob.laborHours.expected;
const sysPrice8 = cPipe8.economicJob.suggestedPrice.expected;
const cAdj8: AdjustmentEntry[] = [
  makeAdj(cRun8.id, 'laborHours', sysLabor8, sysLabor8, sysLabor8 + 1.0, 'OWNER_EXPERIENCE', '2026-09-01T09:15:00Z', 'Door stopper also needs installing'),
  makeAdj(cRun8.id, 'laborHours', sysLabor8, sysLabor8 + 1.0, sysLabor8 + 1.5, 'NEW_CUSTOMER_INFO', '2026-09-01T14:00:00Z', 'Customer mentioned a second smaller hole in closet'),
  makeAdj(cRun8.id, 'price', sysPrice8, sysPrice8, sysPrice8 + 80, 'SCOPE_CHANGED', '2026-09-01T14:05:00Z', 'Added charge for second patch'),
];
const cOutcome8 = makeOutcome(cRun8.id, { laborHours: 4.2, materialCost: 48, procurementHours: 0.5, revenue: Math.round(sysPrice8 + 80), returnTrips: 0 }, '2026-09-02T16:00:00Z');

// I. Accurate — TV mount standard
const cExtract9: ExtractionResult = {
  tradeContexts: ['tv_wall_mounting'], assemblyCandidate: 'STANDARD_TV_MOUNT', assemblyConfidence: 0.92,
  tasks: [
    { component: 'measure_and_layout', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
    { component: 'fasten_or_anchor', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
    { component: 'mount_object', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'customer_reported' },
  ],
  conditions: [], unknowns: [],
  materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.88,
  rawDescription: 'Mount a 55 inch Samsung in the den. Regular drywall over studs.',
};
const cPipe9 = runPipeline(cExtract9, 8);
const cRun9 = buildRun(cPipe9, { createdAt: '2026-09-02T10:00:00Z', workId: 2009, projectFamily: 'tv_wall_mounting' });
const cOutcome9 = makeOutcome(cRun9.id, { laborHours: 1.4, materialCost: 38, procurementHours: 0.25, revenue: Math.round(cPipe9.economicJob.suggestedPrice.expected), returnTrips: 0 }, '2026-09-02T12:00:00Z');

// J. Human adjusted labor + material — fence panel replacement
const cExtract10: ExtractionResult = {
  tradeContexts: ['fence_repair'], assemblyCandidate: 'FENCE_PANEL_REPLACEMENT', assemblyConfidence: 0.82,
  tasks: [
    { component: 'remove_existing_material', quantity: 3, complexity: 'standard', confidence: 0.80, source: 'observed' },
    { component: 'cut_and_fit_material', quantity: 3, complexity: 'standard', confidence: 0.75, source: 'inferred' },
    { component: 'install_board_or_trim', quantity: 3, complexity: 'standard', confidence: 0.75, source: 'inferred' },
    { component: 'fasten_or_anchor', quantity: 3, complexity: 'standard', confidence: 0.80, source: 'inferred' },
  ],
  conditions: ['steep_terrain'], unknowns: ['fence_board_profile'],
  materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.72,
  rawDescription: 'Three fence panels blown down on back slope. Need replacement boards and re-attachment.',
};
const cPipe10 = runPipeline(cExtract10, 16);
const cRun10 = buildRun(cPipe10, { createdAt: '2026-09-03T08:00:00Z', workId: 2010, projectFamily: 'fence_repair' });
const sysLabor10 = cPipe10.economicJob.laborHours.expected;
const sysMat10 = cPipe10.economicJob.materialCost.expected;
const cAdj10: AdjustmentEntry[] = [
  makeAdj(cRun10.id, 'laborHours', sysLabor10, sysLabor10, sysLabor10 + 1.5, 'SITE_CONDITION_DIFFERENT', '2026-09-03T08:30:00Z', 'Steep slope, hard access with materials'),
  makeAdj(cRun10.id, 'materialCost', sysMat10, sysMat10, sysMat10 + 40, 'MATERIAL_COST_DIFFERENT', '2026-09-03T08:35:00Z', 'Cedar fence boards pricier than pine'),
];
const cOutcome10 = makeOutcome(cRun10.id, { laborHours: 6.5, materialCost: 220, procurementHours: 0.75, revenue: 620, returnTrips: 0 }, '2026-09-04T15:00:00Z');

// K. Commercial — accurate drywall in apartment
const cExtract11: ExtractionResult = {
  tradeContexts: ['drywall_repair'], assemblyCandidate: 'SMALL_DRYWALL_PATCH', assemblyConfidence: 0.88,
  tasks: [
    { component: 'patch_surface', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'observed' },
    { component: 'tape_and_mud', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
    { component: 'sand_and_finish', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
    { component: 'paint_or_touchup', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'inferred' },
  ],
  conditions: [], unknowns: [],
  materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.86,
  rawDescription: 'Doorknob hole in hallway drywall, Unit 12A. Standard turnover repair.',
};
const cPipe11 = runPipeline(cExtract11, 18);
const cRun11 = buildRun(cPipe11, { createdAt: '2026-09-04T10:00:00Z', workId: 2011, projectFamily: 'drywall_repair' });
const cOutcome11 = makeOutcome(cRun11.id, { laborHours: 1.5, materialCost: 22, procurementHours: 0.5, revenue: Math.round(cPipe11.economicJob.suggestedPrice.expected), returnTrips: 0 }, '2026-09-04T13:00:00Z');

// L. Accurate — shelving install
const cExtract12: ExtractionResult = {
  tradeContexts: ['general_handyman'], assemblyCandidate: null, assemblyConfidence: 0,
  tasks: [
    { component: 'measure_and_layout', quantity: 3, complexity: 'standard', confidence: 0.85, source: 'customer_reported' },
    { component: 'fasten_or_anchor', quantity: 3, complexity: 'standard', confidence: 0.85, source: 'inferred' },
    { component: 'mount_object', quantity: 3, complexity: 'standard', confidence: 0.85, source: 'customer_reported' },
  ],
  conditions: [], unknowns: [],
  materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.82,
  rawDescription: 'Install 3 floating shelves in the office. I bought the shelves already.',
};
const cPipe12 = runPipeline(cExtract12, 10);
const cRun12 = buildRun(cPipe12, { createdAt: '2026-09-05T09:00:00Z', workId: 2012, projectFamily: 'general_handyman' });
const cOutcome12 = makeOutcome(cRun12.id, { laborHours: 2.2, materialCost: 35, procurementHours: 0.25, revenue: Math.round(cPipe12.economicJob.suggestedPrice.expected), returnTrips: 0 }, '2026-09-05T12:00:00Z');

// Build completed WorkItems
const completedWorkItems: WorkItem[] = [
  buildWorkItem(2001, 'Hallway drywall crack', cPipe1, {
    customerName: 'Karen Mitchell', location: 'Nashville, TN', travel: '6 min',
    description: cExtract1.rawDescription, photos: PHOTOS.drywall,
    opStatus: 'completed', billingStatus: 'paid', estimationRunId: cRun1.id,
    phone: '(615) 555-0134', email: 'karen.m@email.com', address: '214 Maple Ridge Dr, Nashville, TN',
  }),
  buildWorkItem(2002, 'TV mount above fireplace', cPipe2, {
    customerName: 'Tom Bradley', location: 'Nashville, TN', travel: '12 min',
    description: cExtract2.rawDescription, photos: PHOTOS.tv,
    opStatus: 'completed', billingStatus: 'paid', estimationRunId: cRun2.id,
    phone: '(615) 555-0187', email: 'tbradley@email.com', address: '88 Creekwood Ln, Nashville, TN',
  }),
  buildWorkItem(2003, 'Reset 2 fence posts', cPipe3, {
    customerName: 'Brian Hargrove', location: 'Nashville, TN', travel: '10 min',
    description: cExtract3.rawDescription, photos: PHOTOS.fence,
    opStatus: 'completed', billingStatus: 'paid', estimationRunId: cRun3.id,
    phone: '(615) 555-0423', email: 'bhargrove@email.com', address: '402 Shelby Ave, Nashville, TN',
  }),
  buildWorkItem(2004, 'Bathroom door trim replacement', cPipe4, {
    customerName: 'Stacy Caldwell', location: 'Nashville, TN', travel: '8 min',
    description: cExtract4.rawDescription, photos: PHOTOS.interior,
    opStatus: 'completed', billingStatus: 'paid', estimationRunId: cRun4.id,
    phone: '(615) 555-0298', email: 'stacy.c@email.com', address: '72 Hillsboro Pike, Nashville, TN',
  }),
  buildWorkItem(2005, 'Replace 8 deck boards (composite)', cPipe5, {
    customerName: 'Yolanda Freeman', location: 'Nashville, TN', travel: '13 min',
    description: cExtract5.rawDescription, photos: PHOTOS.deck,
    opStatus: 'completed', billingStatus: 'paid', estimationRunId: cRun5.id,
    phone: '(615) 555-0478', email: 'yfreeman@email.com', address: '3310 Charlotte Ave, Nashville, TN',
  }),
  buildWorkItem(2006, 'Kids room drywall patches (2)', cPipe6, {
    customerName: 'Rachel Park', location: 'Nashville, TN', travel: '9 min',
    description: cExtract6.rawDescription, photos: PHOTOS.drywall,
    opStatus: 'completed', billingStatus: 'paid', estimationRunId: cRun6.id,
    phone: '(615) 555-0511', email: 'rpark@email.com', address: '1180 Lischey Ave, Nashville, TN',
  }),
  buildWorkItem(2007, 'Front door replacement', cPipe7, {
    customerName: 'Denise Morales', location: 'Nashville, TN', travel: '11 min',
    description: cExtract7.rawDescription, photos: PHOTOS.exterior,
    opStatus: 'completed', billingStatus: 'paid', estimationRunId: cRun7.id,
    phone: '(615) 555-0267', email: 'dmorales@email.com', address: '2240 Elliston Pl, Nashville, TN',
  }),
  buildWorkItem(2008, 'Medium drywall patch — bedroom', cPipe8, {
    customerName: 'Angela Reeves', location: 'Nashville, TN', travel: '7 min',
    description: cExtract8.rawDescription, photos: PHOTOS.drywall,
    opStatus: 'completed', billingStatus: 'paid', estimationRunId: cRun8.id,
    phone: '(615) 555-0212', email: 'angela.r@email.com', address: '1401 Belmont Blvd, Nashville, TN',
  }),
  buildWorkItem(2009, 'Mount TV in den', cPipe9, {
    customerName: 'James Whitfield', location: 'Nashville, TN', travel: '8 min',
    description: cExtract9.rawDescription, photos: PHOTOS.tv,
    opStatus: 'completed', billingStatus: 'paid', estimationRunId: cRun9.id,
    phone: '(615) 555-0389', email: 'jwhitfield@email.com', address: '637 Fatherland St, Nashville, TN',
  }),
  buildWorkItem(2010, 'Replace 3 fence panels — back slope', cPipe10, {
    customerName: 'Stacy Caldwell', location: 'Nashville, TN', travel: '16 min',
    description: cExtract10.rawDescription, photos: PHOTOS.fence,
    opStatus: 'completed', billingStatus: 'paid', estimationRunId: cRun10.id,
    phone: '(615) 555-0298', email: 'stacy.c@email.com', address: '72 Hillsboro Pike, Nashville, TN',
  }),
  buildWorkItem(2011, 'Unit 12A drywall patch', cPipe11, {
    customerName: 'Greenway Property Management', customerSub: 'Riverside Commons · Unit 12A',
    customerType: 'organization', source: 'commercial_work_order',
    location: 'Nashville, TN', travel: '18 min',
    description: cExtract11.rawDescription, photos: PHOTOS.drywall,
    opStatus: 'completed', billingStatus: 'paid', estimationRunId: cRun11.id,
    companyName: 'Greenway Property Management', propertyName: 'Riverside Commons',
    unitLabel: 'Unit 12A', workOrderNumber: '#GW-2074', requestedBy: 'David Chen',
    requestedByRole: 'Maintenance Director', requestedDate: 'September 3',
    scope: cExtract11.rawDescription,
  }),
  buildWorkItem(2012, 'Install 3 floating shelves', cPipe12, {
    customerName: 'Denise Morales', location: 'Nashville, TN', travel: '10 min',
    description: cExtract12.rawDescription, photos: PHOTOS.interior,
    opStatus: 'completed', billingStatus: 'paid', estimationRunId: cRun12.id,
    phone: '(615) 555-0267', email: 'dmorales@email.com', address: '2240 Elliston Pl, Nashville, TN',
  }),
];

const completedRuns: EstimationRun[] = [
  cRun1, cRun2, cRun3, cRun4, cRun5, cRun6, cRun7, cRun8, cRun9, cRun10, cRun11, cRun12,
];

const allAdjustments: AdjustmentEntry[] = [
  ...cAdj2, ...cAdj3, ...cAdj4, ...cAdj5, ...cAdj8, ...cAdj10,
];

const allOutcomes: ActualOutcome[] = [
  cOutcome1, cOutcome2, cOutcome3, cOutcome4, cOutcome5, cOutcome6,
  cOutcome7, cOutcome8, cOutcome9, cOutcome10, cOutcome11, cOutcome12,
];

// ═══════════════════════════════════════════════════════════════
// PUBLIC EXPORTS
// ═══════════════════════════════════════════════════════════════

export const demoWorkItems: WorkItem[] = [...pendingWorkItems, ...completedWorkItems];

export const demoEstimationRuns: EstimationRun[] = [...pendingRuns, ...completedRuns];

export const demoAdjustments: AdjustmentEntry[] = allAdjustments;

export const demoOutcomes: ActualOutcome[] = allOutcomes;
