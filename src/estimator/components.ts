import type { TaskComponentCode, TaskComponentDef } from './types';

// ~22 reusable handyman task components.
// Each defines transparent deterministic baseline data.
// All marked needs_domain_validation — not yet validated with real data.

export const TASK_COMPONENTS: Record<TaskComponentCode, TaskComponentDef> = {

  site_setup: {
    code: 'site_setup',
    description: 'Initial site assessment, tool staging, vehicle unload',
    labor: { baseHours: 0.25, hoursPerUnit: 0, minimumHours: 0.25 },
    materials: { allowancePerUnit: 0 },
    validationStatus: 'needs_domain_validation',
  },

  protect_work_area: {
    code: 'protect_work_area',
    description: 'Drop cloths, masking, floor protection',
    labor: { baseHours: 0.15, hoursPerUnit: 0.05, minimumHours: 0.15 },
    materials: { allowancePerUnit: 5 },
    validationStatus: 'needs_domain_validation',
  },

  remove_existing_material: {
    code: 'remove_existing_material',
    description: 'Careful removal of existing material (trim, fixture, panel)',
    labor: { baseHours: 0.25, hoursPerUnit: 0.30, minimumHours: 0.25 },
    materials: { allowancePerUnit: 0 },
    validationStatus: 'needs_domain_validation',
  },

  demolition_light: {
    code: 'demolition_light',
    description: 'Light demolition — tear-out of damaged material',
    labor: { baseHours: 0.25, hoursPerUnit: 0.40, minimumHours: 0.25 },
    materials: { allowancePerUnit: 0 },
    validationStatus: 'needs_domain_validation',
  },

  measure_and_layout: {
    code: 'measure_and_layout',
    description: 'Measure, mark, and plan cuts or placement',
    labor: { baseHours: 0.20, hoursPerUnit: 0.10, minimumHours: 0.20 },
    materials: { allowancePerUnit: 0 },
    validationStatus: 'needs_domain_validation',
  },

  cut_and_fit_material: {
    code: 'cut_and_fit_material',
    description: 'Cut material to size, test fit, adjust',
    labor: { baseHours: 0.20, hoursPerUnit: 0.25, minimumHours: 0.20 },
    materials: { allowancePerUnit: 8 },
    validationStatus: 'needs_domain_validation',
  },

  install_sheet_material: {
    code: 'install_sheet_material',
    description: 'Install sheet goods (drywall, plywood, backer board)',
    labor: { baseHours: 0.30, hoursPerUnit: 0.35, minimumHours: 0.30 },
    materials: { allowancePerUnit: 12 },
    validationStatus: 'needs_domain_validation',
  },

  install_board_or_trim: {
    code: 'install_board_or_trim',
    description: 'Install boards, trim, molding, or linear stock',
    labor: { baseHours: 0.25, hoursPerUnit: 0.20, minimumHours: 0.50 },
    materials: { allowancePerUnit: 5 },
    validationStatus: 'needs_domain_validation',
  },

  install_structural_lumber: {
    code: 'install_structural_lumber',
    description: 'Install joists, beams, ledger boards, or heavy framing',
    labor: { baseHours: 0.50, hoursPerUnit: 0.60, minimumHours: 0.75 },
    materials: { allowancePerUnit: 18 },
    validationStatus: 'needs_domain_validation',
  },

  install_decking: {
    code: 'install_decking',
    description: 'Lay deck boards, porch flooring, or similar surface material',
    labor: { baseHours: 0.50, hoursPerUnit: 0.15, minimumHours: 0.50 },
    materials: { allowancePerUnit: 6 },
    validationStatus: 'needs_domain_validation',
  },

  fasten_or_anchor: {
    code: 'fasten_or_anchor',
    description: 'Secure with screws, bolts, anchors, or brackets',
    labor: { baseHours: 0.15, hoursPerUnit: 0.10, minimumHours: 0.15 },
    materials: { allowancePerUnit: 3 },
    validationStatus: 'needs_domain_validation',
  },

  patch_surface: {
    code: 'patch_surface',
    description: 'Fill holes, apply patching compound',
    labor: { baseHours: 0.20, hoursPerUnit: 0.25, minimumHours: 0.20 },
    materials: { allowancePerUnit: 8 },
    validationStatus: 'needs_domain_validation',
  },

  tape_and_mud: {
    code: 'tape_and_mud',
    description: 'Drywall tape, joint compound, multiple coats',
    labor: { baseHours: 0.50, hoursPerUnit: 0.40, minimumHours: 0.50 },
    materials: { allowancePerUnit: 10 },
    validationStatus: 'needs_domain_validation',
  },

  sand_and_finish: {
    code: 'sand_and_finish',
    description: 'Sand smooth, prep for paint or stain',
    labor: { baseHours: 0.25, hoursPerUnit: 0.20, minimumHours: 0.25 },
    materials: { allowancePerUnit: 5 },
    validationStatus: 'needs_domain_validation',
  },

  paint_or_touchup: {
    code: 'paint_or_touchup',
    description: 'Prime and paint or touch-up finish',
    labor: { baseHours: 0.30, hoursPerUnit: 0.25, minimumHours: 0.30 },
    materials: { allowancePerUnit: 10 },
    validationStatus: 'needs_domain_validation',
  },

  seal_or_caulk: {
    code: 'seal_or_caulk',
    description: 'Apply caulk, sealant, or weatherstripping',
    labor: { baseHours: 0.15, hoursPerUnit: 0.10, minimumHours: 0.15 },
    materials: { allowancePerUnit: 5 },
    validationStatus: 'needs_domain_validation',
  },

  install_fixture: {
    code: 'install_fixture',
    description: 'Install new fixture (light, faucet, hardware)',
    labor: { baseHours: 0.50, hoursPerUnit: 0.40, minimumHours: 0.50 },
    materials: { allowancePerUnit: 15 },
    validationStatus: 'needs_domain_validation',
  },

  replace_fixture: {
    code: 'replace_fixture',
    description: 'Remove old fixture and install replacement',
    labor: { baseHours: 0.75, hoursPerUnit: 0.50, minimumHours: 0.75 },
    materials: { allowancePerUnit: 20 },
    validationStatus: 'needs_domain_validation',
  },

  mount_object: {
    code: 'mount_object',
    description: 'Mount item to wall or surface (TV, shelf, bracket)',
    labor: { baseHours: 0.50, hoursPerUnit: 0.35, minimumHours: 0.50 },
    materials: { allowancePerUnit: 10 },
    validationStatus: 'needs_domain_validation',
  },

  minor_framing: {
    code: 'minor_framing',
    description: 'Install or repair framing members (studs, blocking, headers)',
    labor: { baseHours: 0.50, hoursPerUnit: 0.50, minimumHours: 0.50 },
    materials: { allowancePerUnit: 12 },
    validationStatus: 'needs_domain_validation',
  },

  repair_railing: {
    code: 'repair_railing',
    description: 'Repair or replace railing sections, balusters',
    labor: { baseHours: 0.50, hoursPerUnit: 0.40, minimumHours: 0.50 },
    materials: { allowancePerUnit: 15 },
    validationStatus: 'needs_domain_validation',
  },

  set_post: {
    code: 'set_post',
    description: 'Set or reset a post (dig, plumb, concrete)',
    labor: { baseHours: 0.75, hoursPerUnit: 0.60, minimumHours: 0.75 },
    materials: { allowancePerUnit: 20 },
    validationStatus: 'needs_domain_validation',
  },

  build_stairs: {
    code: 'build_stairs',
    description: 'Build or rebuild stair stringers, treads, and risers',
    labor: { baseHours: 1.00, hoursPerUnit: 0.75, minimumHours: 1.50 },
    materials: { allowancePerUnit: 25 },
    validationStatus: 'needs_domain_validation',
  },

  assemble_item: {
    code: 'assemble_item',
    description: 'Assemble furniture, fixture, or pre-fab component',
    labor: { baseHours: 0.30, hoursPerUnit: 0.40, minimumHours: 0.30 },
    materials: { allowancePerUnit: 0 },
    validationStatus: 'needs_domain_validation',
  },

  cleanup: {
    code: 'cleanup',
    description: 'Clean work area, remove debris, final walkthrough',
    labor: { baseHours: 0.20, hoursPerUnit: 0, minimumHours: 0.20 },
    materials: { allowancePerUnit: 0 },
    validationStatus: 'needs_domain_validation',
  },
};

// All known component codes for validation
export const KNOWN_COMPONENT_CODES = new Set<string>(Object.keys(TASK_COMPONENTS));
