import type { HandymanJobFamily, FamilyBaseline } from './types';

// All baseline numbers are NEEDS_VALIDATION — assumed from industry averages,
// not validated with real handyman data. Do not treat as ground truth.

export const BASELINES: Record<HandymanJobFamily, FamilyBaseline> = {

  // ─── Exterior Door Replacement ───
  exterior_door_replacement: {
    classifications: {
      STANDARD_SINGLE: {
        laborHours: { low: 4, expected: 5.5, high: 8 },
        materialCost: { low: 60, expected: 110, high: 180 },
        validationStatus: 'needs_domain_validation',
      },
      OVERSIZED_OR_CUSTOM: {
        laborHours: { low: 5, expected: 7, high: 10 },
        materialCost: { low: 100, expected: 180, high: 300 },
        validationStatus: 'needs_domain_validation',
      },
      FRENCH_OR_DOUBLE: {
        laborHours: { low: 6, expected: 8, high: 12 },
        materialCost: { low: 120, expected: 220, high: 400 },
        validationStatus: 'needs_domain_validation',
      },
    },
    defaultClass: 'STANDARD_SINGLE',
    rules: [
      {
        code: 'TRIM_REPLACEMENT',
        description: 'Trim replacement likely — adds finishing work',
        factKey: 'trimReplacementLikely',
        match: true,
        deltaHoursExpected: 0.75,
        deltaHoursHigh: 1.0,
        deltaMaterialExpected: 25,
        deltaMaterialHigh: 40,
      },
      {
        code: 'FRAME_DAMAGE',
        description: 'Visible frame damage — structural repair needed',
        factKey: 'frameDamageVisible',
        match: true,
        deltaHoursExpected: 1.5,
        deltaHoursHigh: 2.0,
        deltaMaterialExpected: 30,
        deltaMaterialHigh: 60,
        confidenceDelta: -0.10,
        riskFlag: 'structural_frame_damage',
      },
      {
        code: 'CUSTOMER_SUPPLIES_DOOR',
        description: 'Customer supplies door — reduced material cost, compatibility risk',
        factKey: 'customerSuppliesDoor',
        match: true,
        deltaMaterialExpected: -80,
        deltaMaterialHigh: -50,
        confidenceDelta: -0.05,
        riskFlag: 'customer_supplied_compatibility',
      },
      {
        code: 'BRICK_VENEER_ADJACENT',
        description: 'Door frame adjacent to brick — careful cutting needed',
        factKey: 'brickVeneerAdjacent',
        match: true,
        deltaHoursExpected: 0.5,
        deltaHoursHigh: 1.0,
        confidenceDelta: -0.05,
      },
    ],
    validationStatus: 'needs_domain_validation',
  },

  // ─── Drywall Repair ───
  drywall_repair: {
    classifications: {
      SMALL_PATCH: {
        laborHours: { low: 1, expected: 1.5, high: 2.5 },
        materialCost: { low: 15, expected: 30, high: 50 },
        validationStatus: 'needs_domain_validation',
      },
      MEDIUM_PATCH: {
        laborHours: { low: 2, expected: 3, high: 4.5 },
        materialCost: { low: 25, expected: 50, high: 80 },
        validationStatus: 'needs_domain_validation',
      },
      SECTION_REPLACEMENT: {
        laborHours: { low: 3, expected: 4.5, high: 7 },
        materialCost: { low: 40, expected: 75, high: 130 },
        validationStatus: 'needs_domain_validation',
      },
    },
    defaultClass: 'MEDIUM_PATCH',
    rules: [
      {
        code: 'CEILING_WORK',
        description: 'Ceiling work adds difficulty and time',
        factKey: 'ceilingWork',
        match: true,
        deltaHoursExpected: 0.75,
        deltaHoursHigh: 1.25,
      },
      {
        code: 'TEXTURE_MATCHING',
        description: 'Texture matching requires extra finishing passes',
        factKey: 'textureMatchingLikely',
        match: true,
        deltaHoursExpected: 0.5,
        deltaHoursHigh: 1.0,
      },
      {
        code: 'NEAR_ELECTRICAL',
        description: 'Proximity to electrical may require care or licensed work',
        factKey: 'nearElectrical',
        match: true,
        confidenceDelta: -0.05,
        riskFlag: 'electrical_proximity',
      },
      {
        code: 'WATER_DAMAGE',
        description: 'Water damage may extend behind visible area',
        factKey: 'waterDamagePresent',
        match: true,
        deltaHoursHigh: 2.0,
        confidenceDelta: -0.10,
        riskFlag: 'hidden_water_damage',
      },
      {
        code: 'MULTIPLE_PATCHES',
        description: 'Additional patches add per-patch setup time',
        factKey: 'patchCount',
        match: 2, // triggers when patchCount >= 2 (handled in estimator)
        deltaHoursExpected: 0.75,
        deltaHoursHigh: 1.0,
        deltaMaterialExpected: 15,
        deltaMaterialHigh: 25,
      },
    ],
    validationStatus: 'needs_domain_validation',
  },

  // ─── Deck Repair ───
  deck_repair: {
    classifications: {
      BOARD_REPLACEMENT: {
        laborHours: { low: 3, expected: 5, high: 8 },
        materialCost: { low: 80, expected: 160, high: 280 },
        validationStatus: 'needs_domain_validation',
      },
      STRUCTURAL_REPAIR: {
        laborHours: { low: 6, expected: 10, high: 16 },
        materialCost: { low: 200, expected: 400, high: 700 },
        validationStatus: 'needs_domain_validation',
      },
      SECTION_REBUILD: {
        laborHours: { low: 10, expected: 16, high: 24 },
        materialCost: { low: 350, expected: 650, high: 1100 },
        validationStatus: 'needs_domain_validation',
      },
    },
    defaultClass: 'STRUCTURAL_REPAIR',
    rules: [
      {
        code: 'RAILING_REPAIR',
        description: 'Railing repair or replacement adds time',
        factKey: 'railingRepairNeeded',
        match: true,
        deltaHoursExpected: 2,
        deltaHoursHigh: 3,
        deltaMaterialExpected: 60,
        deltaMaterialHigh: 120,
      },
      {
        code: 'HEIGHT_ACCESS',
        description: 'Elevated deck requires extra safety precautions',
        factKey: 'elevatedDeck',
        match: true,
        deltaHoursExpected: 1,
        deltaHoursHigh: 2,
        confidenceDelta: -0.05,
        riskFlag: 'height_access',
      },
      {
        code: 'JOIST_DAMAGE',
        description: 'Joist damage may require structural assessment',
        factKey: 'joistDamageVisible',
        match: true,
        deltaHoursExpected: 2,
        deltaHoursHigh: 4,
        deltaMaterialExpected: 80,
        deltaMaterialHigh: 180,
        confidenceDelta: -0.10,
        riskFlag: 'structural_joist_damage',
      },
      {
        code: 'STAIRS_INVOLVED',
        description: 'Stairs add complexity to deck repair',
        factKey: 'stairsInvolved',
        match: true,
        deltaHoursExpected: 1.5,
        deltaHoursHigh: 2.5,
        deltaMaterialExpected: 40,
        deltaMaterialHigh: 80,
      },
    ],
    validationStatus: 'needs_domain_validation',
  },

  // ─── Fence Repair ───
  fence_repair: {
    classifications: {
      POST_RESET: {
        laborHours: { low: 2, expected: 3.5, high: 5 },
        materialCost: { low: 30, expected: 60, high: 100 },
        validationStatus: 'needs_domain_validation',
      },
      PANEL_REPLACEMENT: {
        laborHours: { low: 3, expected: 5, high: 8 },
        materialCost: { low: 80, expected: 160, high: 280 },
        validationStatus: 'needs_domain_validation',
      },
      SECTION_REBUILD: {
        laborHours: { low: 5, expected: 8, high: 12 },
        materialCost: { low: 150, expected: 300, high: 500 },
        validationStatus: 'needs_domain_validation',
      },
    },
    defaultClass: 'PANEL_REPLACEMENT',
    rules: [
      {
        code: 'GATE_REPAIR',
        description: 'Gate repair adds hardware and alignment work',
        factKey: 'gateRepairNeeded',
        match: true,
        deltaHoursExpected: 1.5,
        deltaHoursHigh: 2.5,
        deltaMaterialExpected: 40,
        deltaMaterialHigh: 80,
      },
      {
        code: 'CONCRETE_SETTING',
        description: 'New concrete footings needed for posts',
        factKey: 'concreteSettingNeeded',
        match: true,
        deltaHoursExpected: 1,
        deltaHoursHigh: 2,
        deltaMaterialExpected: 20,
        deltaMaterialHigh: 40,
      },
      {
        code: 'TERRAIN_DIFFICULTY',
        description: 'Difficult terrain (slope, rocks) slows work',
        factKey: 'difficultTerrain',
        match: true,
        deltaHoursExpected: 0.5,
        deltaHoursHigh: 1.5,
        confidenceDelta: -0.05,
      },
      {
        code: 'MULTIPLE_POSTS',
        description: 'Additional damaged posts beyond the first',
        factKey: 'damagedPostCount',
        match: 2,
        deltaHoursExpected: 1,
        deltaHoursHigh: 1.5,
        deltaMaterialExpected: 25,
        deltaMaterialHigh: 50,
      },
    ],
    validationStatus: 'needs_domain_validation',
  },

  // ─── TV / Wall Mounting ───
  tv_wall_mounting: {
    classifications: {
      STANDARD_MOUNT: {
        laborHours: { low: 1, expected: 1.5, high: 2.5 },
        materialCost: { low: 20, expected: 40, high: 80 },
        validationStatus: 'needs_domain_validation',
      },
      ABOVE_FIREPLACE: {
        laborHours: { low: 1.5, expected: 2, high: 3 },
        materialCost: { low: 30, expected: 50, high: 90 },
        validationStatus: 'needs_domain_validation',
      },
      CONCEALED_WIRING: {
        laborHours: { low: 2, expected: 3, high: 4.5 },
        materialCost: { low: 40, expected: 70, high: 120 },
        validationStatus: 'needs_domain_validation',
      },
    },
    defaultClass: 'STANDARD_MOUNT',
    rules: [
      {
        code: 'MULTIPLE_TVS',
        description: 'Additional TV adds per-unit install time',
        factKey: 'tvCount',
        match: 2,
        deltaHoursExpected: 1,
        deltaHoursHigh: 1.5,
        deltaMaterialExpected: 30,
        deltaMaterialHigh: 60,
      },
      {
        code: 'CUSTOMER_SUPPLIES_MOUNT',
        description: 'Customer supplies mount bracket — reduced material, compatibility risk',
        factKey: 'customerSuppliesMount',
        match: true,
        deltaMaterialExpected: -25,
        deltaMaterialHigh: -15,
        confidenceDelta: -0.05,
        riskFlag: 'customer_supplied_compatibility',
      },
      {
        code: 'PLASTER_WALL',
        description: 'Plaster/lath walls require special anchoring',
        factKey: 'plasterWall',
        match: true,
        deltaHoursExpected: 0.5,
        deltaHoursHigh: 1.0,
        confidenceDelta: -0.05,
      },
    ],
    validationStatus: 'needs_domain_validation',
  },
};
