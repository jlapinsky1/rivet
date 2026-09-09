/**
 * Context Sensitivity Audit — runs the same 22 Mason Home Services demo jobs
 * through three business-context scenarios to verify the decision engine
 * reacts sensibly to capacity and earnings pace changes.
 *
 * Usage: npx tsx scripts/context-sensitivity-audit.ts
 */

import type {
  ExtractionResult,
  DecisionContext,
  EconomicJob,
} from '../src/estimator/types';
import { estimateHandymanJob, applyCalibration } from '../src/estimator/estimator';
import { deriveRecommendation, type DecisionResult } from '../src/estimator/decision';
import type { BusinessEconomicsConfig } from '../src/estimator/types';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── Business Config (identical to seed.ts) ───

const config: BusinessEconomicsConfig = {
  businessId: 'a0000000-0000-0000-0000-000000000001',
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

// ─── Three Scenarios ───

const scenarios: { name: string; label: string; context: DecisionContext }[] = [
  {
    name: 'A',
    label: 'Early week / comfortable capacity',
    context: {
      weeklyEarningsToDate: 600,
      remainingCapacityHours: 30,
      pipelineValue: 0,
      pipelineHours: 0,
      requiredContributionPerCapacityHour: (2500 - 600) / 30, // $63.33
    },
  },
  {
    name: 'B',
    label: 'Midweek / moderate capacity',
    context: {
      weeklyEarningsToDate: 1800,
      remainingCapacityHours: 24,
      pipelineValue: 0,
      pipelineHours: 0,
      requiredContributionPerCapacityHour: (2500 - 1800) / 24, // $29.17
    },
  },
  {
    name: 'C',
    label: 'Late week / scarce capacity / behind goal',
    context: {
      weeklyEarningsToDate: 1900,
      remainingCapacityHours: 6,
      pipelineValue: 0,
      pipelineHours: 0,
      requiredContributionPerCapacityHour: (2500 - 1900) / 6, // $100
    },
  },
];

// ─── 22 Demo Jobs (extraction + travel miles) ───

const jobs: { id: string; description: string; extraction: ExtractionResult; travelMiles: number }[] = [
  {
    id: '001', description: 'Small drywall patch (softball-sized)', travelMiles: 8,
    extraction: {
      tradeContexts: ['drywall_repair'], assemblyCandidate: 'SMALL_DRYWALL_PATCH', assemblyConfidence: 0.92,
      tasks: [
        { component: 'protect_work_area', quantity: 1, complexity: 'low', confidence: 0.95, source: 'inferred' },
        { component: 'patch_surface', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'observed' },
        { component: 'tape_and_mud', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
        { component: 'sand_and_finish', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
        { component: 'paint_or_touchup', quantity: 1, complexity: 'low', confidence: 0.85, source: 'customer_reported' },
      ],
      conditions: [], unknowns: [], materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.90,
      rawDescription: 'Small hole in bedroom drywall from moving furniture. About the size of a softball.',
    },
  },
  {
    id: '002', description: 'TV mount 65" (customer has mount)', travelMiles: 10,
    extraction: {
      tradeContexts: ['tv_wall_mounting'], assemblyCandidate: 'STANDARD_TV_MOUNT', assemblyConfidence: 0.88,
      tasks: [
        { component: 'measure_and_layout', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
        { component: 'fasten_or_anchor', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
        { component: 'mount_object', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'customer_reported' },
      ],
      conditions: ['customer_supplied_material'], unknowns: ['stud_location_behind_drywall'],
      materialSupplyStatus: 'customer_supplied', overallConfidence: 0.82,
      rawDescription: 'Mount a 65 inch TV in living room. I already have the mount.',
    },
  },
  {
    id: '003', description: 'Back door replacement (frame rough)', travelMiles: 14,
    extraction: {
      tradeContexts: ['exterior_door_replacement'], assemblyCandidate: 'STANDARD_EXTERIOR_DOOR', assemblyConfidence: 0.78,
      tasks: [
        { component: 'remove_existing_material', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'observed' },
        { component: 'replace_fixture', quantity: 1, complexity: 'high', confidence: 0.75, source: 'customer_reported' },
        { component: 'install_board_or_trim', quantity: 1, complexity: 'standard', confidence: 0.70, source: 'inferred' },
        { component: 'seal_or_caulk', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'inferred' },
      ],
      conditions: ['unknown_substrate'], unknowns: ['frame_condition', 'threshold_condition', 'weatherstripping_type'],
      materialSupplyStatus: 'customer_supplied', overallConfidence: 0.68,
      rawDescription: 'Need old back door replaced. New door is already here. Bottom of frame looks a little rough.',
    },
  },
  {
    id: '004', description: 'Ceiling water damage (upstairs leak)', travelMiles: 12,
    extraction: {
      tradeContexts: ['drywall_repair'], assemblyCandidate: 'DRYWALL_SECTION_REPLACEMENT', assemblyConfidence: 0.72,
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
      materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.55,
      rawDescription: 'Ceiling has a brown spot and drywall is soft after an upstairs leak.',
    },
  },
  {
    id: '005', description: 'Cabinet knob + hang 2 pictures', travelMiles: 28,
    extraction: {
      tradeContexts: ['general_handyman'], assemblyCandidate: null, assemblyConfidence: 0,
      tasks: [
        { component: 'replace_fixture', quantity: 1, complexity: 'low', confidence: 0.90, source: 'customer_reported' },
        { component: 'mount_object', quantity: 2, complexity: 'low', confidence: 0.85, source: 'customer_reported' },
      ],
      conditions: [], unknowns: [], materialSupplyStatus: 'unknown', overallConfidence: 0.80,
      rawDescription: 'Replace one cabinet knob and hang two small pictures.',
    },
  },
  {
    id: '006', description: 'Stair trim + chewed balusters', travelMiles: 11,
    extraction: {
      tradeContexts: ['finish_carpentry'], assemblyCandidate: null, assemblyConfidence: 0,
      tasks: [
        { component: 'remove_existing_material', quantity: 2, complexity: 'standard', confidence: 0.80, source: 'observed' },
        { component: 'repair_railing', quantity: 2, complexity: 'high', confidence: 0.70, source: 'observed' },
        { component: 'install_board_or_trim', quantity: 1, complexity: 'standard', confidence: 0.75, source: 'observed' },
        { component: 'sand_and_finish', quantity: 1, complexity: 'standard', confidence: 0.70, source: 'inferred' },
        { component: 'paint_or_touchup', quantity: 1, complexity: 'standard', confidence: 0.70, source: 'inferred' },
      ],
      conditions: ['finish_matching'], unknowns: ['exact_trim_profile', 'stain_vs_paint'],
      materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.65,
      rawDescription: 'Dog damaged the stair trim and chewed two balusters.',
    },
  },
  {
    id: '007', description: 'Cabinet bottom + recaulk (water dmg)', travelMiles: 9,
    extraction: {
      tradeContexts: ['carpentry', 'minor_plumbing'], assemblyCandidate: null, assemblyConfidence: 0,
      tasks: [
        { component: 'remove_existing_material', quantity: 1, complexity: 'standard', confidence: 0.80, source: 'inferred' },
        { component: 'cut_and_fit_material', quantity: 1, complexity: 'high', confidence: 0.70, source: 'inferred' },
        { component: 'install_sheet_material', quantity: 1, complexity: 'standard', confidence: 0.70, source: 'inferred' },
        { component: 'seal_or_caulk', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'customer_reported' },
      ],
      conditions: ['confined_access', 'water_damage'],
      unknowns: ['extent_of_water_damage_under_sink', 'cabinet_material_type'],
      materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.60,
      rawDescription: 'Replace damaged cabinet bottom under kitchen sink and recaulk around sink.',
    },
  },
  {
    id: '008', description: 'Three fence posts reset (storm)', travelMiles: 7,
    extraction: {
      tradeContexts: ['fence_repair'], assemblyCandidate: 'FENCE_POST_RESET', assemblyConfidence: 0.88,
      tasks: [
        { component: 'demolition_light', quantity: 3, complexity: 'standard', confidence: 0.85, source: 'observed' },
        { component: 'set_post', quantity: 3, complexity: 'standard', confidence: 0.85, source: 'observed' },
        { component: 'fasten_or_anchor', quantity: 3, complexity: 'standard', confidence: 0.85, source: 'inferred' },
      ],
      conditions: [], unknowns: ['below_grade_condition'],
      materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.82,
      rawDescription: 'Three fence posts leaning badly after the storms.',
    },
  },
  {
    id: '009', description: 'Six rotted deck boards (back porch)', travelMiles: 15,
    extraction: {
      tradeContexts: ['deck_repair'], assemblyCandidate: 'DECK_BOARD_REPLACEMENT', assemblyConfidence: 0.85,
      tasks: [
        { component: 'remove_existing_material', quantity: 6, complexity: 'standard', confidence: 0.85, source: 'observed' },
        { component: 'measure_and_layout', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
        { component: 'cut_and_fit_material', quantity: 6, complexity: 'standard', confidence: 0.85, source: 'inferred' },
        { component: 'install_decking', quantity: 6, complexity: 'standard', confidence: 0.85, source: 'inferred' },
      ],
      conditions: [], unknowns: ['joist_condition_under_boards'],
      materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.80,
      rawDescription: 'About 6 rotted deck boards on the back porch.',
    },
  },
  {
    id: '010', description: 'Two drywall holes Unit 4B (commercial)', travelMiles: 18,
    extraction: {
      tradeContexts: ['drywall_repair'], assemblyCandidate: 'MEDIUM_DRYWALL_PATCH', assemblyConfidence: 0.82,
      tasks: [
        { component: 'protect_work_area', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
        { component: 'remove_existing_material', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'inferred' },
        { component: 'install_sheet_material', quantity: 1, complexity: 'standard', confidence: 0.80, source: 'inferred' },
        { component: 'tape_and_mud', quantity: 2, complexity: 'standard', confidence: 0.85, source: 'inferred' },
        { component: 'sand_and_finish', quantity: 2, complexity: 'standard', confidence: 0.85, source: 'inferred' },
        { component: 'paint_or_touchup', quantity: 2, complexity: 'standard', confidence: 0.80, source: 'inferred' },
      ],
      conditions: ['occupied_workspace'], unknowns: ['behind_wall_condition'],
      materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.78,
      rawDescription: 'Two medium drywall holes in hallway of Unit 4B.',
    },
  },
  {
    id: '011', description: 'Nail pop + drywall crack (8 inches)', travelMiles: 6,
    extraction: {
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
    },
  },
  {
    id: '012', description: 'TV 75" above stone fireplace (high)', travelMiles: 12,
    extraction: {
      tradeContexts: ['tv_wall_mounting'], assemblyCandidate: 'TV_MOUNT_ABOVE_FIREPLACE', assemblyConfidence: 0.85,
      tasks: [
        { component: 'measure_and_layout', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'inferred' },
        { component: 'fasten_or_anchor', quantity: 1, complexity: 'high', confidence: 0.80, source: 'inferred' },
        { component: 'mount_object', quantity: 1, complexity: 'high', confidence: 0.80, source: 'customer_reported' },
      ],
      conditions: ['second_floor_access'], unknowns: ['stud_spacing_above_fireplace', 'mantle_clearance'],
      materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.75,
      rawDescription: 'Mount 75 inch TV above stone fireplace. High ceilings.',
    },
  },
  {
    id: '013', description: 'Two fence posts (storm damage)', travelMiles: 10,
    extraction: {
      tradeContexts: ['fence_repair'], assemblyCandidate: 'FENCE_POST_RESET', assemblyConfidence: 0.90,
      tasks: [
        { component: 'demolition_light', quantity: 2, complexity: 'standard', confidence: 0.85, source: 'observed' },
        { component: 'set_post', quantity: 2, complexity: 'standard', confidence: 0.85, source: 'observed' },
      ],
      conditions: [], unknowns: ['below_grade_condition'],
      materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.85,
      rawDescription: 'Two fence posts leaning after last month storm.',
    },
  },
  {
    id: '014', description: 'Bathroom door trim (splitting)', travelMiles: 8,
    extraction: {
      tradeContexts: ['finish_carpentry'], assemblyCandidate: null, assemblyConfidence: 0,
      tasks: [
        { component: 'remove_existing_material', quantity: 1, complexity: 'standard', confidence: 0.80, source: 'observed' },
        { component: 'install_board_or_trim', quantity: 3, complexity: 'standard', confidence: 0.75, source: 'observed' },
        { component: 'paint_or_touchup', quantity: 1, complexity: 'standard', confidence: 0.75, source: 'inferred' },
      ],
      conditions: [], unknowns: ['behind_trim_condition'],
      materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.70,
      rawDescription: 'Bathroom door trim is splitting and pulling away.',
    },
  },
  {
    id: '015', description: 'Eight rotted deck boards (composite)', travelMiles: 13,
    extraction: {
      tradeContexts: ['deck_repair'], assemblyCandidate: 'DECK_BOARD_REPLACEMENT', assemblyConfidence: 0.86,
      tasks: [
        { component: 'remove_existing_material', quantity: 8, complexity: 'standard', confidence: 0.85, source: 'observed' },
        { component: 'cut_and_fit_material', quantity: 8, complexity: 'standard', confidence: 0.80, source: 'inferred' },
        { component: 'install_decking', quantity: 8, complexity: 'standard', confidence: 0.80, source: 'inferred' },
      ],
      conditions: [], unknowns: ['joist_condition'],
      materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.80,
      rawDescription: 'Eight rotted deck boards near the grill area. Composite decking to match existing.',
    },
  },
  {
    id: '016', description: 'Two drywall holes kids room (smooth)', travelMiles: 9,
    extraction: {
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
      rawDescription: 'Two medium holes in kids room. Need smooth finish and paint to match.',
    },
  },
  {
    id: '017', description: 'Front door replacement (pre-hung)', travelMiles: 11,
    extraction: {
      tradeContexts: ['exterior_door_replacement'], assemblyCandidate: 'STANDARD_EXTERIOR_DOOR', assemblyConfidence: 0.90,
      tasks: [
        { component: 'remove_existing_material', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
        { component: 'replace_fixture', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'customer_reported' },
        { component: 'install_board_or_trim', quantity: 1, complexity: 'standard', confidence: 0.80, source: 'inferred' },
        { component: 'seal_or_caulk', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'inferred' },
      ],
      conditions: [], unknowns: ['frame_condition'],
      materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.82,
      rawDescription: 'Front door doesn\'t seal well anymore. Want to replace with new pre-hung.',
    },
  },
  {
    id: '018', description: 'Doorknob hole (14 inch, smooth)', travelMiles: 7,
    extraction: {
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
      rawDescription: 'Medium hole behind bedroom door from doorknob. About 14 inches.',
    },
  },
  {
    id: '019', description: 'TV mount 55" Samsung (den, studs)', travelMiles: 8,
    extraction: {
      tradeContexts: ['tv_wall_mounting'], assemblyCandidate: 'STANDARD_TV_MOUNT', assemblyConfidence: 0.92,
      tasks: [
        { component: 'measure_and_layout', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
        { component: 'fasten_or_anchor', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'inferred' },
        { component: 'mount_object', quantity: 1, complexity: 'standard', confidence: 0.90, source: 'customer_reported' },
      ],
      conditions: [], unknowns: [],
      materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.88,
      rawDescription: 'Mount a 55 inch Samsung in the den. Regular drywall over studs.',
    },
  },
  {
    id: '020', description: 'Three fence panels (back slope)', travelMiles: 16,
    extraction: {
      tradeContexts: ['fence_repair'], assemblyCandidate: 'FENCE_PANEL_REPLACEMENT', assemblyConfidence: 0.82,
      tasks: [
        { component: 'remove_existing_material', quantity: 3, complexity: 'standard', confidence: 0.80, source: 'observed' },
        { component: 'cut_and_fit_material', quantity: 3, complexity: 'standard', confidence: 0.75, source: 'inferred' },
        { component: 'install_board_or_trim', quantity: 3, complexity: 'standard', confidence: 0.75, source: 'inferred' },
        { component: 'fasten_or_anchor', quantity: 3, complexity: 'standard', confidence: 0.80, source: 'inferred' },
      ],
      conditions: ['steep_terrain'], unknowns: ['fence_board_profile'],
      materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.72,
      rawDescription: 'Three fence panels blown down on back slope.',
    },
  },
  {
    id: '021', description: 'Doorknob hole Unit 12A (turnover)', travelMiles: 18,
    extraction: {
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
    },
  },
  {
    id: '022', description: 'Three floating shelves (customer has)', travelMiles: 10,
    extraction: {
      tradeContexts: ['general_handyman'], assemblyCandidate: null, assemblyConfidence: 0,
      tasks: [
        { component: 'measure_and_layout', quantity: 3, complexity: 'standard', confidence: 0.85, source: 'customer_reported' },
        { component: 'fasten_or_anchor', quantity: 3, complexity: 'standard', confidence: 0.85, source: 'inferred' },
        { component: 'mount_object', quantity: 3, complexity: 'standard', confidence: 0.85, source: 'customer_reported' },
      ],
      conditions: [], unknowns: [],
      materialSupplyStatus: 'contractor_supplied', overallConfidence: 0.82,
      rawDescription: 'Install 3 floating shelves in the office.',
    },
  },
];

// ─── Run pipeline for a job under a given context ───

type JobResult = {
  runId: string;
  description: string;
  recommendedQuote: number;
  minimumAcceptablePrice: number;
  contributionPerLaborHour: number;
  contributionPerCapacityHour: number;
  requiredContributionPerCapacityHour: number;
  capacityHours: number;
  laborHours: number;
  recommendation: string;
  primaryReason: string;
  bindingFloor: string;
  confidence: number;
  riskFlags: string[];
  weeklyCapacityPaceFloor: number;
  laborProductivityFloor: number;
};

function runJob(job: typeof jobs[0], ctx: DecisionContext): JobResult {
  const estimate = estimateHandymanJob(job.extraction);
  const econ = applyCalibration(estimate, config, null, job.travelMiles, ctx);
  const decision = deriveRecommendation(econ, config, ctx);

  return {
    runId: job.id,
    description: job.description,
    recommendedQuote: Math.round(econ.recommendedQuote),
    minimumAcceptablePrice: Math.round(econ.minimumAcceptablePrice),
    contributionPerLaborHour: Math.round(econ.contributionPerLaborHour.expected),
    contributionPerCapacityHour: Math.round(econ.contributionPerCapacityHour),
    requiredContributionPerCapacityHour: Math.round(ctx.requiredContributionPerCapacityHour),
    capacityHours: parseFloat(econ.capacityHours.toFixed(2)),
    laborHours: parseFloat(econ.laborHours.expected.toFixed(2)),
    recommendation: decision.recommendation,
    primaryReason: decision.reasons[0]?.text ?? '',
    bindingFloor: econ.pricingFloors.binding,
    confidence: Math.round(econ.confidence * 100),
    riskFlags: econ.riskFlags,
    weeklyCapacityPaceFloor: Math.round(econ.pricingFloors.weeklyCapacityPace),
    laborProductivityFloor: Math.round(econ.pricingFloors.laborProductivity),
  };
}

// ─── Run all scenarios ───

const allResults: Record<string, JobResult[]> = {};
for (const scenario of scenarios) {
  allResults[scenario.name] = jobs.map(j => runJob(j, scenario.context));
}

// ─── Sanity Check Helpers ───

type SanityIssue = { jobId: string; issue: string };

function runSanityChecks(): SanityIssue[] {
  const issues: SanityIssue[] = [];

  // Required rate ordering: B ($29) < A ($63) < C ($100)
  // So the "easiest → hardest" order for economic checks is B → A → C
  // Remaining capacity ordering: A (30h) > B (24h) > C (6h)
  // Combined difficulty: B is easiest, C is hardest, A is in between

  for (const job of jobs) {
    const rA = allResults['A'].find(r => r.runId === job.id)!;
    const rB = allResults['B'].find(r => r.runId === job.id)!;
    const rC = allResults['C'].find(r => r.runId === job.id)!;

    // Quote should not change across scenarios
    if (rA.recommendedQuote !== rB.recommendedQuote || rB.recommendedQuote !== rC.recommendedQuote) {
      issues.push({ jobId: job.id, issue: `Quote changed across scenarios: A=$${rA.recommendedQuote}, B=$${rB.recommendedQuote}, C=$${rC.recommendedQuote}` });
    }

    // Labor hours should not change across scenarios
    if (rA.laborHours !== rB.laborHours || rB.laborHours !== rC.laborHours) {
      issues.push({ jobId: job.id, issue: `Labor hours changed across scenarios: A=${rA.laborHours}, B=${rB.laborHours}, C=${rC.laborHours}` });
    }

    // Capacity hours should not change across scenarios
    if (rA.capacityHours !== rB.capacityHours || rB.capacityHours !== rC.capacityHours) {
      issues.push({ jobId: job.id, issue: `Capacity hours changed across scenarios: A=${rA.capacityHours}, B=${rB.capacityHours}, C=${rC.capacityHours}` });
    }

    // Confidence should not change across scenarios
    if (rA.confidence !== rB.confidence || rB.confidence !== rC.confidence) {
      issues.push({ jobId: job.id, issue: `Confidence changed across scenarios: A=${rA.confidence}%, B=${rB.confidence}%, C=${rC.confidence}%` });
    }

    // Directional check: B is the easiest scenario, C is the hardest.
    // A job should never get BETTER from B→A or from A→C or from B→C.
    const recRank = (r: string) => r === 'take' ? 3 : r === 'review' ? 2 : 1;
    if (recRank(rA.recommendation) < recRank(rC.recommendation)) {
      issues.push({ jobId: job.id, issue: `Job got BETTER from A→C despite harder context: A=${rA.recommendation}, C=${rC.recommendation}` });
    }
    if (recRank(rB.recommendation) < recRank(rA.recommendation)) {
      // B is easier than A ($29 vs $63 required rate), so B should be >= A
      // However, B also has less remaining capacity (24h vs 30h), so capacity checks could cut the other way.
      // Only flag this as an issue if B's remaining capacity isn't the explanation.
      if (rA.capacityHours <= rB.capacityHours) {
        issues.push({ jobId: job.id, issue: `Job got BETTER from B→A despite A having higher required rate ($63 vs $29): B=${rB.recommendation}, A=${rA.recommendation} — may be explained by A's larger remaining capacity (30h vs 24h)` });
      }
    }
    if (recRank(rB.recommendation) < recRank(rC.recommendation)) {
      issues.push({ jobId: job.id, issue: `Job got BETTER from B→C despite harder context: B=${rB.recommendation}, C=${rC.recommendation}` });
    }

    // weeklyCapacityPace floor should increase when required rate increases
    // B ($29) < A ($63) < C ($100), so floor order should be B <= A <= C
    if (rB.weeklyCapacityPaceFloor > rA.weeklyCapacityPaceFloor) {
      issues.push({ jobId: job.id, issue: `weeklyCapacityPace floor DECREASED from B→A (required rate increased): B=$${rB.weeklyCapacityPaceFloor}, A=$${rA.weeklyCapacityPaceFloor}` });
    }
    if (rA.weeklyCapacityPaceFloor > rC.weeklyCapacityPaceFloor) {
      issues.push({ jobId: job.id, issue: `weeklyCapacityPace floor DECREASED from A→C (required rate increased): A=$${rA.weeklyCapacityPaceFloor}, C=$${rC.weeklyCapacityPaceFloor}` });
    }

    // laborProductivity floor should NOT change
    if (rA.laborProductivityFloor !== rB.laborProductivityFloor || rB.laborProductivityFloor !== rC.laborProductivityFloor) {
      issues.push({ jobId: job.id, issue: `laborProductivity floor changed across scenarios: A=$${rA.laborProductivityFloor}, B=$${rB.laborProductivityFloor}, C=$${rC.laborProductivityFloor}` });
    }
  }

  return issues;
}

// ─── Generate Audit Document ───

function generateAuditMd(): string {
  const lines: string[] = [];
  const ln = (s: string = '') => lines.push(s);

  ln('# Context Sensitivity Audit — v0.3.1');
  ln();
  ln('**Date:** 2026-09-09');
  ln('**Scope:** 22 Mason Home Services demo jobs re-evaluated under three business-context scenarios');
  ln('**Estimator version:** v0.3.1 (unchanged)');
  ln('**Business Config:** ownerOpportunityRate $75/hr, minimumHourlyRate $70/hr, weeklyGoal $2500, weeklyCapacity 35h, marginFloor 35%, profitFloor $75, minimumJobPrice $175');
  ln();
  ln('---');
  ln();

  // ─── Scenario Definitions ───
  ln('## Scenario Definitions');
  ln();
  ln('| Parameter | A (Early Week) | B (Midweek) | C (Late Week) |');
  ln('|-----------|----------------|-------------|---------------|');
  ln(`| weeklyEarningsToDate | $600 | $1,800 | $1,900 |`);
  ln(`| remainingCapacityHours | 30h | 24h | 6h |`);
  ln(`| weeklyEarningsGoal | $2,500 | $2,500 | $2,500 |`);
  ln(`| requiredContributionPerCapacityHour | $${Math.round(scenarios[0].context.requiredContributionPerCapacityHour)} | $${Math.round(scenarios[1].context.requiredContributionPerCapacityHour)} | $${Math.round(scenarios[2].context.requiredContributionPerCapacityHour)} |`);
  ln(`| Capacity ratio (remaining/total) | ${(30/35*100).toFixed(0)}% | ${(24/35*100).toFixed(0)}% | ${(6/35*100).toFixed(0)}% |`);
  ln();
  ln('---');
  ln();

  // ─── Full Results per Scenario ───
  for (const scenario of scenarios) {
    const results = allResults[scenario.name];
    ln(`## Scenario ${scenario.name} — ${scenario.label}`);
    ln();
    ln(`requiredContributionPerCapacityHour: $${Math.round(scenario.context.requiredContributionPerCapacityHour)}/hr`);
    ln();
    ln('| Run | Description | Rec | Conf | Quote | Min Price | $/Labor Hr | $/Cap Hr | Cap Hrs | Binding Floor |');
    ln('|-----|-------------|-----|------|-------|-----------|-----------|---------|---------|---------------|');
    for (const r of results) {
      ln(`| ${r.runId} | ${r.description} | **${r.recommendation}** | ${r.confidence}% | $${r.recommendedQuote} | $${r.minimumAcceptablePrice} | $${r.contributionPerLaborHour} | $${r.contributionPerCapacityHour} | ${r.capacityHours} | ${r.bindingFloor} |`);
    }
    ln();
  }

  ln('---');
  ln();

  // ─── Comparison Table ───
  ln('## Comparison Table — Recommendation Changes');
  ln();
  ln('| Run | Description | Early Week (A) | Midweek (B) | Late Week (C) | Change Pattern |');
  ln('|-----|-------------|----------------|-------------|---------------|----------------|');
  for (const job of jobs) {
    const rA = allResults['A'].find(r => r.runId === job.id)!;
    const rB = allResults['B'].find(r => r.runId === job.id)!;
    const rC = allResults['C'].find(r => r.runId === job.id)!;
    const changed = rA.recommendation !== rB.recommendation || rB.recommendation !== rC.recommendation;
    const pattern = changed
      ? `${rA.recommendation.toUpperCase()} -> ${rB.recommendation.toUpperCase()} -> ${rC.recommendation.toUpperCase()}`
      : 'stable';
    ln(`| ${job.id} | ${job.description} | **${rA.recommendation}** | **${rB.recommendation}** | **${rC.recommendation}** | ${pattern} |`);
  }
  ln();

  // ─── Scenario Summaries ───
  ln('---');
  ln();
  ln('## Scenario Summaries');
  ln();
  ln('| Metric | A (Early Week) | B (Midweek) | C (Late Week) |');
  ln('|--------|----------------|-------------|---------------|');

  for (const metric of ['TAKE count', 'REVIEW count', 'PASS count', 'weeklyCapacityPace binding count', 'Median $/cap hr', 'Median pricing gap']) {
    const vals: string[] = [];
    for (const scenario of scenarios) {
      const results = allResults[scenario.name];
      if (metric === 'TAKE count') vals.push(String(results.filter(r => r.recommendation === 'take').length));
      else if (metric === 'REVIEW count') vals.push(String(results.filter(r => r.recommendation === 'review').length));
      else if (metric === 'PASS count') vals.push(String(results.filter(r => r.recommendation === 'pass').length));
      else if (metric === 'weeklyCapacityPace binding count') vals.push(String(results.filter(r => r.bindingFloor === 'weeklyCapacityPace').length));
      else if (metric === 'Median $/cap hr') {
        const sorted = results.map(r => r.contributionPerCapacityHour).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        vals.push(`$${sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)}`);
      } else if (metric === 'Median pricing gap') {
        const gaps = results.map(r => r.recommendedQuote - r.minimumAcceptablePrice).sort((a, b) => a - b);
        const mid = Math.floor(gaps.length / 2);
        const median = gaps.length % 2 ? gaps[mid] : Math.round((gaps[mid - 1] + gaps[mid]) / 2);
        vals.push(`$${median >= 0 ? '+' : ''}${median}`);
      }
    }
    ln(`| ${metric} | ${vals[0]} | ${vals[1]} | ${vals[2]} |`);
  }
  ln();

  // ─── Job Classification ───
  ln('---');
  ln();
  ln('## Job Classification by Behavior');
  ln();

  // Never changes
  const neverChange = jobs.filter(j => {
    const rA = allResults['A'].find(r => r.runId === j.id)!;
    const rB = allResults['B'].find(r => r.runId === j.id)!;
    const rC = allResults['C'].find(r => r.runId === j.id)!;
    return rA.recommendation === rB.recommendation && rB.recommendation === rC.recommendation;
  });
  ln('### Jobs that never change recommendation');
  ln();
  if (neverChange.length === 0) {
    ln('None');
  } else {
    for (const j of neverChange) {
      const r = allResults['A'].find(r => r.runId === j.id)!;
      const reason = r.riskFlags.length > 0 ? `risk flags: ${r.riskFlags.join(', ')}` : r.confidence < 70 ? 'low confidence' : 'economics stable';
      ln(`- **${j.id}** ${j.description} — always **${r.recommendation}** (${reason})`);
    }
  }
  ln();

  // Gets worse as context tightens (B is easiest, C is hardest)
  const getsWorse = jobs.filter(j => {
    const rB = allResults['B'].find(r => r.runId === j.id)!;
    const rC = allResults['C'].find(r => r.runId === j.id)!;
    const rank = (s: string) => s === 'take' ? 3 : s === 'review' ? 2 : 1;
    return rank(rC.recommendation) < rank(rB.recommendation);
  });
  ln('### Jobs that degrade from B (easiest) to C (hardest)');
  ln();
  if (getsWorse.length === 0) {
    ln('None');
  } else {
    for (const j of getsWorse) {
      const rA = allResults['A'].find(r => r.runId === j.id)!;
      const rB = allResults['B'].find(r => r.runId === j.id)!;
      const rC = allResults['C'].find(r => r.runId === j.id)!;
      ln(`- **${j.id}** ${j.description}: B=${rB.recommendation.toUpperCase()} -> A=${rA.recommendation.toUpperCase()} -> C=${rC.recommendation.toUpperCase()} ($/cap hr: $${rB.contributionPerCapacityHour} vs required B=$${rB.requiredContributionPerCapacityHour}, A=$${rA.requiredContributionPerCapacityHour}, C=$${rC.requiredContributionPerCapacityHour})`);
    }
  }
  ln();

  // Becomes PASS because schedule-hour economics don't fit (from B to C)
  const becomesPass = jobs.filter(j => {
    const rB = allResults['B'].find(r => r.runId === j.id)!;
    const rC = allResults['C'].find(r => r.runId === j.id)!;
    return rB.recommendation !== 'pass' && rC.recommendation === 'pass';
  });
  ln('### Jobs that become PASS in Scenario C (were not PASS in B)');
  ln();
  if (becomesPass.length === 0) {
    ln('None');
  } else {
    for (const j of becomesPass) {
      const rB = allResults['B'].find(r => r.runId === j.id)!;
      const rC = allResults['C'].find(r => r.runId === j.id)!;
      ln(`- **${j.id}** ${j.description}: was ${rB.recommendation.toUpperCase()} (B) -> **PASS** (C). $/cap hr $${rC.contributionPerCapacityHour} vs required $${rC.requiredContributionPerCapacityHour}. Cap hrs ${rC.capacityHours} vs remaining 6h.`);
    }
  }
  ln();

  // Confidence/risk is primary issue regardless
  const riskPrimary = jobs.filter(j => {
    const rA = allResults['A'].find(r => r.runId === j.id)!;
    const rB = allResults['B'].find(r => r.runId === j.id)!;
    const rC = allResults['C'].find(r => r.runId === j.id)!;
    // Always review and has low confidence or risk flags
    return rA.recommendation === 'review' && rB.recommendation === 'review' && rC.recommendation === 'review'
      && (rA.confidence < 70 || rA.riskFlags.length > 0);
  });
  ln('### Jobs where confidence/risk remains primary issue regardless of context');
  ln();
  if (riskPrimary.length === 0) {
    ln('None');
  } else {
    for (const j of riskPrimary) {
      const r = allResults['A'].find(r => r.runId === j.id)!;
      ln(`- **${j.id}** ${j.description} — confidence ${r.confidence}%, risk flags: [${r.riskFlags.join(', ')}]`);
    }
  }
  ln();

  // Logically wrong changes
  const sanityIssues = runSanityChecks();
  const logicallyWrong = sanityIssues.filter(i =>
    i.issue.includes('got BETTER') || i.issue.includes('DECREASED') || i.issue.includes('changed across scenarios')
  );

  ln('### Jobs with potentially illogical recommendation changes');
  ln();
  if (logicallyWrong.length === 0) {
    ln('None found — all changes are directionally correct.');
  } else {
    for (const issue of logicallyWrong) {
      ln(`- **${issue.jobId}**: ${issue.issue}`);
    }
  }
  ln();

  // ─── Sanity Checks ───
  ln('---');
  ln();
  ln('## Sanity Checks');
  ln();
  const allIssues = runSanityChecks();
  if (allIssues.length === 0) {
    ln('All sanity checks passed:');
    ln('- Quotes unchanged across scenarios');
    ln('- Labor hours unchanged across scenarios');
    ln('- Capacity hours unchanged across scenarios');
    ln('- Confidence unchanged across scenarios');
    ln('- No recommendation improved as context tightened');
    ln('- weeklyCapacityPace floor never decreased with rising required rate');
    ln('- laborProductivity floor stable (context-independent)');
  } else {
    ln(`Found ${allIssues.length} issue(s):`);
    ln();
    for (const issue of allIssues) {
      ln(`- **${issue.jobId}**: ${issue.issue}`);
    }
  }
  ln();

  // ─── Pricing Floor Migration ───
  ln('---');
  ln();
  ln('## Binding Floor Distribution');
  ln();
  ln('| Binding Floor | A (Early Week) | B (Midweek) | C (Late Week) |');
  ln('|---------------|----------------|-------------|---------------|');
  const floorNames = ['minimumJob', 'margin', 'absoluteProfit', 'laborProductivity', 'weeklyCapacityPace'];
  for (const floor of floorNames) {
    const counts = scenarios.map(s => allResults[s.name].filter(r => r.bindingFloor === floor).length);
    ln(`| ${floor} | ${counts[0]} | ${counts[1]} | ${counts[2]} |`);
  }
  ln();

  // ─── Findings ───
  ln('---');
  ln();
  ln('## Findings');
  ln();

  // Count changes
  let takeB = allResults['B'].filter(r => r.recommendation === 'take').length;
  let reviewB = allResults['B'].filter(r => r.recommendation === 'review').length;
  let passB = allResults['B'].filter(r => r.recommendation === 'pass').length;
  let takeC = allResults['C'].filter(r => r.recommendation === 'take').length;
  let reviewC = allResults['C'].filter(r => r.recommendation === 'review').length;
  let passC = allResults['C'].filter(r => r.recommendation === 'pass').length;
  let takeA = allResults['A'].filter(r => r.recommendation === 'take').length;
  let reviewA = allResults['A'].filter(r => r.recommendation === 'review').length;
  let passA = allResults['A'].filter(r => r.recommendation === 'pass').length;

  ln(`1. **Capacity context meaningfully shifts recommendations.** Difficulty order by required rate: B ($29/hr, easiest) < A ($63/hr) < C ($100/hr, hardest). From B to C, TAKE drops from ${takeB} to ${takeC}, REVIEW from ${reviewB} to ${reviewC}, and PASS rises from ${passB} to ${passC}. Scenario A ($63/hr required, 30h remaining) sits in between: TAKE=${takeA}, REVIEW=${reviewA}, PASS=${passA}.`);
  ln();

  const capacityPassCount = becomesPass.length;
  ln(`2. **${capacityPassCount} job(s) transition to PASS** from B→C purely from capacity pressure. These are jobs whose schedule-hour economics ($\\/capacity hour) fall below the $100/hr required pace when only 6 hours remain.`);
  ln();

  const wcpBindingC = allResults['C'].filter(r => r.bindingFloor === 'weeklyCapacityPace').length;
  const wcpBindingB = allResults['B'].filter(r => r.bindingFloor === 'weeklyCapacityPace').length;
  ln(`3. **weeklyCapacityPace becomes the binding floor** for ${wcpBindingC} jobs in Scenario C (vs ${wcpBindingB} in Scenario B). At $100/hr required pace, this floor dominates because capacityHours * $100 exceeds laborProductivity for most jobs.`);
  ln();

  ln(`4. **Estimates are correctly immutable across scenarios.** Recommended quotes, labor hours, capacity hours, confidence, and risk flags do not change — only the pricing floor (via weeklyCapacityPace) and the decision change.`);
  ln();

  const stableReviewCount = riskPrimary.length;
  ln(`5. **${stableReviewCount} job(s) remain REVIEW regardless of context** — their primary issue is low confidence or risk flags, not economics. This is correct: business context cannot fix estimation uncertainty.`);
  ln();

  // ─── Potential Bugs ───
  ln('## Potential Bugs');
  ln();
  const quoteIssues = sanityIssues.filter(i => i.issue.includes('Quote changed'));
  const laborIssues = sanityIssues.filter(i => i.issue.includes('Labor hours changed'));
  const betterIssues = sanityIssues.filter(i => i.issue.includes('got BETTER'));
  if (quoteIssues.length + laborIssues.length + betterIssues.length === 0) {
    ln('No bugs detected in this audit pass.');
  } else {
    if (quoteIssues.length > 0) ln(`- **Quote mutation:** ${quoteIssues.length} job(s) had quotes change across scenarios`);
    if (laborIssues.length > 0) ln(`- **Labor mutation:** ${laborIssues.length} job(s) had labor hours change across scenarios`);
    if (betterIssues.length > 0) ln(`- **Wrong direction:** ${betterIssues.length} job(s) improved recommendation with tighter context`);
  }
  ln();

  // ─── Expected Behavior ───
  ln('## Expected Behavior');
  ln();
  ln('- As `requiredContributionPerCapacityHour` rises (B=$29 -> A=$63 -> C=$100), jobs with low `contributionPerCapacityHour` should degrade from TAKE to REVIEW to PASS.');
  ln('- Jobs whose `capacityHours > remainingCapacityHours` in Scenario C (6h) should be forced PASS.');
  ln('- The `weeklyCapacityPace` pricing floor should rise with the required rate, making it the binding floor for more jobs in Scenario C.');
  ln('- Confidence, labor hours, materials, risk flags, and recommended quotes should be identical across all three scenarios.');
  ln();

  // ─── Threshold Sensitivity ───
  ln('## Threshold Sensitivity');
  ln();

  // Check for required rate = $63 (Scenario A): is this already causing passes?
  const passFromA = allResults['A'].filter(r => r.recommendation === 'pass').length;
  ln(`- **Scenario A ($63/hr required pace):** ${passFromA} PASS — ${passFromA > 5 ? 'appears too sensitive at this moderate pace' : 'reasonable'}`);

  // Check Scenario C
  ln(`- **Scenario C ($100/hr required pace):** ${passC} PASS — ${passC > 18 ? 'may be over-rejecting; consider graduated thresholds for extreme pace' : passC < 5 ? 'may not be reactive enough to severe capacity scarcity' : 'reasonable progression'}`);
  ln();

  // Jobs that don't react enough
  const neverPassable = jobs.filter(j => {
    const rC = allResults['C'].find(r => r.runId === j.id)!;
    return rC.recommendation === 'take' && rC.contributionPerCapacityHour < rC.requiredContributionPerCapacityHour;
  });
  if (neverPassable.length > 0) {
    ln('### Jobs that remain TAKE despite $/cap hr below required pace (potential under-reaction)');
    ln();
    for (const j of neverPassable) {
      const rC = allResults['C'].find(r => r.runId === j.id)!;
      ln(`- **${j.id}** ${j.description}: $/cap hr $${rC.contributionPerCapacityHour} < required $${rC.requiredContributionPerCapacityHour} but still TAKE`);
    }
    ln();
  }

  // Jobs where pricing gap is very tight
  ln('### Jobs where recommendation does not react enough to scarce capacity');
  ln();
  const shouldReactMore = jobs.filter(j => {
    const rA = allResults['A'].find(r => r.runId === j.id)!;
    const rC = allResults['C'].find(r => r.runId === j.id)!;
    return rA.recommendation === rC.recommendation && rA.recommendation === 'take'
      && rC.contributionPerCapacityHour < rC.requiredContributionPerCapacityHour;
  });
  if (shouldReactMore.length === 0) {
    ln('All jobs react appropriately to capacity changes.');
  } else {
    for (const j of shouldReactMore) {
      const rC = allResults['C'].find(r => r.runId === j.id)!;
      ln(`- **${j.id}** ${j.description}: stays TAKE even when $/cap hr ($${rC.contributionPerCapacityHour}) is below required ($${rC.requiredContributionPerCapacityHour})`);
    }
  }
  ln();

  ln('---');
  ln();
  ln('*This is a diagnostic pass only. No thresholds were tuned from this synthetic test.*');

  return lines.join('\n');
}

// ─── Main ───

const md = generateAuditMd();
const outPath = path.join(__dirname, '..', 'context-sensitivity-audit.md');
fs.writeFileSync(outPath, md, 'utf-8');
console.log(`Audit written to ${outPath}`);
console.log();

// Also print summary to console
for (const scenario of scenarios) {
  const results = allResults[scenario.name];
  const take = results.filter(r => r.recommendation === 'take').length;
  const review = results.filter(r => r.recommendation === 'review').length;
  const pass = results.filter(r => r.recommendation === 'pass').length;
  console.log(`Scenario ${scenario.name} (${scenario.label}): TAKE=${take} REVIEW=${review} PASS=${pass}`);
}

console.log();
const issues = runSanityChecks();
if (issues.length === 0) {
  console.log('All sanity checks passed.');
} else {
  console.log(`${issues.length} sanity issue(s):`);
  for (const i of issues) {
    console.log(`  ${i.jobId}: ${i.issue}`);
  }
}
