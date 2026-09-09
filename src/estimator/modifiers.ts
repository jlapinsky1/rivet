import type { ConditionCode, ConditionModifierDef } from './types';

// Condition modifiers applied to both assembly and component estimates.
// Plain code — not a rule DSL.

export const CONDITION_MODIFIERS: Record<ConditionCode, ConditionModifierDef> = {

  confined_access: {
    code: 'confined_access',
    description: 'Tight or awkward access to work area',
    laborMultiplier: 1.15,
    laborHighMultiplier: 1.25,
    confidenceDelta: -0.05,
  },

  overhead_work: {
    code: 'overhead_work',
    description: 'Work on ceiling or above head height',
    laborMultiplier: 1.15,
    laborHighMultiplier: 1.25,
  },

  second_floor_access: {
    code: 'second_floor_access',
    description: 'Requires ladder or scaffolding access',
    laborMultiplier: 1.10,
    laborHighMultiplier: 1.20,
    confidenceDelta: -0.05,
    riskFlag: 'height_access',
  },

  steep_terrain: {
    code: 'steep_terrain',
    description: 'Sloped, uneven, or difficult terrain',
    laborMultiplier: 1.10,
    laborHighMultiplier: 1.20,
    confidenceDelta: -0.05,
  },

  occupied_workspace: {
    code: 'occupied_workspace',
    description: 'Work area has furniture/belongings requiring extra care',
    laborMultiplier: 1.10,
  },

  finish_matching: {
    code: 'finish_matching',
    description: 'Must match existing paint, texture, stain, or grain',
    laborMultiplier: 1.15,
    laborHighMultiplier: 1.30,
    materialMultiplier: 1.10,
    confidenceDelta: -0.05,
  },

  customer_supplied_material: {
    code: 'customer_supplied_material',
    description: 'Customer supplies primary materials — compatibility risk',
    materialMultiplier: 0.30,
    confidenceDelta: -0.05,
    riskFlag: 'customer_supplied_compatibility',
  },

  unknown_substrate: {
    code: 'unknown_substrate',
    description: 'Wall/floor/surface material unknown — may complicate work',
    laborHighMultiplier: 1.20,
    confidenceDelta: -0.10,
    riskFlag: 'unknown_substrate',
  },

  near_electrical: {
    code: 'near_electrical',
    description: 'Work near electrical wiring, outlets, or panels',
    confidenceDelta: -0.05,
    riskFlag: 'electrical_proximity',
  },

  water_damage: {
    code: 'water_damage',
    description: 'Visible or suspected water damage — hidden extent unknown',
    laborHighMultiplier: 1.40,
    materialMultiplier: 1.15,
    confidenceDelta: -0.10,
    riskFlag: 'hidden_water_damage',
  },

  special_order_material: {
    code: 'special_order_material',
    description: 'Materials may require special order or sourcing',
    materialMultiplier: 1.20,
    confidenceDelta: -0.05,
    returnTripRisk: 'medium',
  },

  multiple_visits_required: {
    code: 'multiple_visits_required',
    description: 'Work requires multiple visits (dry time, parts, inspections)',
    laborMultiplier: 1.10,
    confidenceDelta: -0.05,
    returnTripRisk: 'high',
  },
};

export const KNOWN_CONDITION_CODES = new Set<string>(Object.keys(CONDITION_MODIFIERS));
