import type { Assembly } from './types';

// Validated assemblies — reframed from the original 5 job families.
// Each assembly carries a direct labor/material range (MVP).
// Component mappings are conceptual — assemblies don't need to sum components yet.
// All marked needs_domain_validation.

export const ASSEMBLIES: Record<string, Assembly> = {

  // ─── Exterior Door Replacement ───

  STANDARD_EXTERIOR_DOOR: {
    code: 'STANDARD_EXTERIOR_DOOR',
    description: 'Standard pre-hung single exterior door replacement',
    tradeContext: 'exterior_door_replacement',
    laborHours: { low: 4, expected: 5.5, high: 8 },
    materialCost: { low: 60, expected: 110, high: 180 },
    components: ['remove_existing_material', 'measure_and_layout', 'install_fixture', 'install_board_or_trim', 'seal_or_caulk', 'cleanup'],
    validationStatus: 'needs_domain_validation',
  },

  OVERSIZED_EXTERIOR_DOOR: {
    code: 'OVERSIZED_EXTERIOR_DOOR',
    description: 'Oversized, non-standard, or custom exterior door replacement',
    tradeContext: 'exterior_door_replacement',
    laborHours: { low: 5, expected: 7, high: 10 },
    materialCost: { low: 100, expected: 180, high: 300 },
    components: ['remove_existing_material', 'measure_and_layout', 'minor_framing', 'install_fixture', 'install_board_or_trim', 'seal_or_caulk', 'cleanup'],
    validationStatus: 'needs_domain_validation',
  },

  FRENCH_DOOR_REPLACEMENT: {
    code: 'FRENCH_DOOR_REPLACEMENT',
    description: 'French doors or double entry door replacement',
    tradeContext: 'exterior_door_replacement',
    laborHours: { low: 6, expected: 8, high: 12 },
    materialCost: { low: 120, expected: 220, high: 400 },
    components: ['remove_existing_material', 'measure_and_layout', 'minor_framing', 'install_fixture', 'install_board_or_trim', 'seal_or_caulk', 'cleanup'],
    validationStatus: 'needs_domain_validation',
  },

  // ─── Drywall Repair ───

  SMALL_DRYWALL_PATCH: {
    code: 'SMALL_DRYWALL_PATCH',
    description: 'Small drywall patch (under ~12 inches)',
    tradeContext: 'drywall_repair',
    laborHours: { low: 1, expected: 1.5, high: 2.5 },
    materialCost: { low: 15, expected: 30, high: 50 },
    components: ['protect_work_area', 'patch_surface', 'tape_and_mud', 'sand_and_finish', 'paint_or_touchup', 'cleanup'],
    validationStatus: 'needs_domain_validation',
  },

  MEDIUM_DRYWALL_PATCH: {
    code: 'MEDIUM_DRYWALL_PATCH',
    description: 'Medium drywall patch (12-24 inches or multiple small areas)',
    tradeContext: 'drywall_repair',
    laborHours: { low: 2, expected: 3, high: 4.5 },
    materialCost: { low: 25, expected: 50, high: 80 },
    components: ['protect_work_area', 'remove_existing_material', 'cut_and_fit_material', 'install_sheet_material', 'tape_and_mud', 'sand_and_finish', 'paint_or_touchup', 'cleanup'],
    validationStatus: 'needs_domain_validation',
  },

  DRYWALL_SECTION_REPLACEMENT: {
    code: 'DRYWALL_SECTION_REPLACEMENT',
    description: 'Drywall section replacement (exceeds ~24 inches or spans stud bay)',
    tradeContext: 'drywall_repair',
    laborHours: { low: 3, expected: 4.5, high: 7 },
    materialCost: { low: 40, expected: 75, high: 130 },
    components: ['protect_work_area', 'demolition_light', 'minor_framing', 'cut_and_fit_material', 'install_sheet_material', 'tape_and_mud', 'sand_and_finish', 'paint_or_touchup', 'cleanup'],
    validationStatus: 'needs_domain_validation',
  },

  // ─── Deck Repair ───

  DECK_BOARD_REPLACEMENT: {
    code: 'DECK_BOARD_REPLACEMENT',
    description: 'Replace surface deck boards (no structural work)',
    tradeContext: 'deck_repair',
    laborHours: { low: 3, expected: 5, high: 8 },
    materialCost: { low: 80, expected: 160, high: 280 },
    components: ['remove_existing_material', 'measure_and_layout', 'cut_and_fit_material', 'install_decking', 'fasten_or_anchor', 'cleanup'],
    validationStatus: 'needs_domain_validation',
  },

  DECK_STRUCTURAL_REPAIR: {
    code: 'DECK_STRUCTURAL_REPAIR',
    description: 'Deck structural repair (posts, beams, or joists)',
    tradeContext: 'deck_repair',
    laborHours: { low: 6, expected: 10, high: 16 },
    materialCost: { low: 200, expected: 400, high: 700 },
    components: ['demolition_light', 'set_post', 'install_structural_lumber', 'install_decking', 'fasten_or_anchor', 'cleanup'],
    validationStatus: 'needs_domain_validation',
  },

  DECK_SECTION_REBUILD: {
    code: 'DECK_SECTION_REBUILD',
    description: 'Full deck section rebuild',
    tradeContext: 'deck_repair',
    laborHours: { low: 10, expected: 16, high: 24 },
    materialCost: { low: 350, expected: 650, high: 1100 },
    components: ['demolition_light', 'set_post', 'install_structural_lumber', 'install_decking', 'build_stairs', 'repair_railing', 'fasten_or_anchor', 'cleanup'],
    validationStatus: 'needs_domain_validation',
  },

  // ─── Fence Repair ───

  FENCE_POST_RESET: {
    code: 'FENCE_POST_RESET',
    description: 'Reset leaning fence posts',
    tradeContext: 'fence_repair',
    laborHours: { low: 2, expected: 3.5, high: 5 },
    materialCost: { low: 30, expected: 60, high: 100 },
    components: ['demolition_light', 'set_post', 'fasten_or_anchor', 'cleanup'],
    validationStatus: 'needs_domain_validation',
  },

  FENCE_PANEL_REPLACEMENT: {
    code: 'FENCE_PANEL_REPLACEMENT',
    description: 'Replace damaged fence panels or boards',
    tradeContext: 'fence_repair',
    laborHours: { low: 3, expected: 5, high: 8 },
    materialCost: { low: 80, expected: 160, high: 280 },
    components: ['remove_existing_material', 'measure_and_layout', 'cut_and_fit_material', 'install_board_or_trim', 'fasten_or_anchor', 'cleanup'],
    validationStatus: 'needs_domain_validation',
  },

  FENCE_SECTION_REBUILD: {
    code: 'FENCE_SECTION_REBUILD',
    description: 'Full fence section rebuild (posts + panels)',
    tradeContext: 'fence_repair',
    laborHours: { low: 5, expected: 8, high: 12 },
    materialCost: { low: 150, expected: 300, high: 500 },
    components: ['demolition_light', 'set_post', 'measure_and_layout', 'cut_and_fit_material', 'install_board_or_trim', 'fasten_or_anchor', 'cleanup'],
    validationStatus: 'needs_domain_validation',
  },

  // ─── TV / Wall Mounting ───

  STANDARD_TV_MOUNT: {
    code: 'STANDARD_TV_MOUNT',
    description: 'Standard stud-wall TV mount',
    tradeContext: 'tv_wall_mounting',
    laborHours: { low: 1, expected: 1.5, high: 2.5 },
    materialCost: { low: 20, expected: 40, high: 80 },
    components: ['measure_and_layout', 'fasten_or_anchor', 'mount_object', 'cleanup'],
    validationStatus: 'needs_domain_validation',
  },

  TV_MOUNT_ABOVE_FIREPLACE: {
    code: 'TV_MOUNT_ABOVE_FIREPLACE',
    description: 'TV mount above fireplace (height, heat, mantle)',
    tradeContext: 'tv_wall_mounting',
    laborHours: { low: 1.5, expected: 2, high: 3 },
    materialCost: { low: 30, expected: 50, high: 90 },
    components: ['measure_and_layout', 'fasten_or_anchor', 'mount_object', 'cleanup'],
    validationStatus: 'needs_domain_validation',
  },

  TV_MOUNT_CONCEALED_WIRING: {
    code: 'TV_MOUNT_CONCEALED_WIRING',
    description: 'TV mount with in-wall cable concealment',
    tradeContext: 'tv_wall_mounting',
    laborHours: { low: 2, expected: 3, high: 4.5 },
    materialCost: { low: 40, expected: 70, high: 120 },
    components: ['measure_and_layout', 'cut_and_fit_material', 'fasten_or_anchor', 'mount_object', 'patch_surface', 'paint_or_touchup', 'cleanup'],
    validationStatus: 'needs_domain_validation',
  },
};

// Assembly codes grouped by trade context for lookup
export const ASSEMBLIES_BY_TRADE: Record<string, string[]> = {};
for (const assembly of Object.values(ASSEMBLIES)) {
  const list = ASSEMBLIES_BY_TRADE[assembly.tradeContext] ?? [];
  list.push(assembly.code);
  ASSEMBLIES_BY_TRADE[assembly.tradeContext] = list;
}

// All known assembly codes
export const KNOWN_ASSEMBLY_CODES = new Set<string>(Object.keys(ASSEMBLIES));

// Minimum assembly confidence to use assembly path
export const ASSEMBLY_CONFIDENCE_THRESHOLD = 0.75;
