import type { ExtractionResult, ExtractedTask } from './types';

export const PROMPT_VERSION = '0.2.0';
export const AI_MODEL = 'claude-sonnet-4-20250514';

// ─── 3-Phase Extraction Prompt (Assembly + Component Decomposition) ───

export const EXTRACTION_PROMPT = `You are Rivet's handyman job intake extractor. Your job is to identify what work needs to happen and extract structured facts from a customer's description and photos.

You will work through three phases in order.

## PHASE 1: Visual Extraction
Look at the photos and description. State ONLY what you can physically observe:
- Identify materials, surfaces, and conditions
- Estimate physical dimensions as approximate (e.g., "roughly 6 inches")
- Note access conditions (height, confined spaces, terrain)
- Note proximity issues (electrical, plumbing, brick)
- List what CANNOT be determined from the photos

## PHASE 2: Scope Identification
Determine what work needs to happen.

### A. Check for known assemblies
If the job clearly matches a common scope, identify it:

DRYWALL: SMALL_DRYWALL_PATCH, MEDIUM_DRYWALL_PATCH, DRYWALL_SECTION_REPLACEMENT
DOORS: STANDARD_EXTERIOR_DOOR, OVERSIZED_EXTERIOR_DOOR, FRENCH_DOOR_REPLACEMENT
DECK: DECK_BOARD_REPLACEMENT, DECK_STRUCTURAL_REPAIR, DECK_SECTION_REBUILD
FENCE: FENCE_POST_RESET, FENCE_PANEL_REPLACEMENT, FENCE_SECTION_REBUILD
TV MOUNT: STANDARD_TV_MOUNT, TV_MOUNT_ABOVE_FIREPLACE, TV_MOUNT_CONCEALED_WIRING

### B. Decompose into task components
Whether or not an assembly matches, identify the individual work tasks:

Available components:
site_setup, protect_work_area, remove_existing_material, demolition_light,
measure_and_layout, cut_and_fit_material, install_sheet_material,
install_board_or_trim, install_structural_lumber, install_decking,
fasten_or_anchor, patch_surface, tape_and_mud, sand_and_finish,
paint_or_touchup, seal_or_caulk, install_fixture, replace_fixture,
mount_object, minor_framing, repair_railing, set_post, build_stairs,
assemble_item, cleanup

For each task, identify:
- component code
- quantity (number of units, patches, posts, etc.)
- complexity: low, standard, or high
- confidence: 0-1
- source: observed, inferred, or customer_reported

### C. Identify conditions
Note any conditions that affect the work:
confined_access, overhead_work, second_floor_access, steep_terrain,
occupied_workspace, finish_matching, customer_supplied_material,
unknown_substrate, near_electrical, water_damage, special_order_material,
multiple_visits_required

## PHASE 3: Structured Output
Return ONLY a JSON object with these fields:
- tradeContexts: array of relevant trade areas (e.g. ["drywall"], ["finish_carpentry", "minor_plumbing"])
- assemblyCandidate: assembly code if one clearly matches, or null
- assemblyConfidence: 0-1 confidence in the assembly match (0 if null)
- tasks: array of task objects with {component, quantity, quantityUnit?, complexity, confidence, source, notes?}
- conditions: array of condition codes
- unknowns: array of things you cannot determine
- materialSupplyStatus: "customer_supplied", "contractor_supplied", or "unknown"
- overallConfidence: number 0-1

Do NOT return labor hours, material costs, prices, profit, or Take/Review/Pass recommendations.`;

export const EXTRACTION_SCHEMA = {
  type: 'object',
  required: ['tradeContexts', 'assemblyCandidate', 'assemblyConfidence', 'tasks', 'conditions', 'unknowns', 'materialSupplyStatus', 'overallConfidence'],
  properties: {
    tradeContexts: { type: 'array', items: { type: 'string' } },
    assemblyCandidate: { type: ['string', 'null'] },
    assemblyConfidence: { type: 'number', minimum: 0, maximum: 1 },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['component', 'quantity', 'confidence', 'source'],
        properties: {
          component: { type: 'string' },
          quantity: { type: 'number' },
          quantityUnit: { type: 'string' },
          complexity: { type: 'string', enum: ['low', 'standard', 'high'] },
          confidence: { type: 'number', minimum: 0, maximum: 1 },
          source: { type: 'string', enum: ['observed', 'inferred', 'customer_reported'] },
          notes: { type: 'object' },
        },
      },
    },
    conditions: { type: 'array', items: { type: 'string' } },
    unknowns: { type: 'array', items: { type: 'string' } },
    materialSupplyStatus: { type: 'string', enum: ['customer_supplied', 'contractor_supplied', 'unknown'] },
    overallConfidence: { type: 'number', minimum: 0, maximum: 1 },
  },
} as const;

// ─── Client-side: calls server-side Netlify Function ───

export type ExtractionInput = {
  description: string;
  photos?: string[];
  customerNotes?: string;
};

export async function extractJobFacts(input: ExtractionInput): Promise<ExtractionResult> {
  try {
    const response = await fetch('/.netlify/functions/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      console.warn('AI extraction failed, falling back to stub:', response.status);
      return extractJobFactsStub(input);
    }

    const result = await response.json();
    return { ...result, rawDescription: input.description } as ExtractionResult;
  } catch (err) {
    console.warn('AI extraction unavailable, falling back to stub:', err);
    return extractJobFactsStub(input);
  }
}

// ─── Test/Dev Stub: keyword matching ───

type TradePattern = [string, RegExp, string | null, ExtractedTask[]];

const TRADE_PATTERNS: TradePattern[] = [
  // Drywall
  ['drywall', /\b(drywall|sheetrock|wall\s+(hole|patch|repair|damage)|plaster\s+repair)/i, null, []],
  // Exterior door
  ['exterior_door_replacement', /\b(exterior\s+door|front\s+door|entry\s+door|door\s+replac)/i, null, []],
  // Deck
  ['deck_repair', /\b(deck\s+(repair|replace|fix|board|rot)|deck\b)/i, null, []],
  // Fence
  ['fence_repair', /\b(fence\s+(repair|replace|fix|lean|post)|fence\b)/i, null, []],
  // TV mount
  ['tv_wall_mounting', /\b(tv\s+(mount|install|hang|wall)|wall\s+mount|mount\s+(a\s+)?\d*\s*(?:inch\s+)?tv|mount\s+tv)/i, null, []],
  // Carpentry
  ['finish_carpentry', /\b(trim|baseboard|molding|baluster|stair\s+rail|wainscot|crown)/i, null, []],
  ['carpentry', /\b(build|rebuild|construct|frame|joist|beam|lumber|wood\s+repair)/i, null, []],
  // Plumbing
  ['minor_plumbing', /\b(faucet|sink|toilet|pipe|plumb|leak|drain|shut.?off)/i, null, []],
  // Painting
  ['painting', /\b(paint|prime|stain|repaint)/i, null, []],
];

const ASSEMBLY_PATTERNS: [RegExp, string][] = [
  // Drywall
  [/\b(large|big|major|section|stud\s*bay)\b.*\b(drywall|sheetrock)/i, 'DRYWALL_SECTION_REPLACEMENT'],
  [/\b(drywall|sheetrock).*\b(large|big|major|section|stud\s*bay)/i, 'DRYWALL_SECTION_REPLACEMENT'],
  [/\b(small|tiny|nail|fist|punch)\b.*\b(drywall|sheetrock|hole|patch)/i, 'SMALL_DRYWALL_PATCH'],
  [/\b(drywall|sheetrock|wall)\s*(hole|patch|repair|damage)/i, 'MEDIUM_DRYWALL_PATCH'],
  // Doors
  [/\b(french|double)\s+door/i, 'FRENCH_DOOR_REPLACEMENT'],
  [/\b(oversize|custom|non.?standard)\s+door/i, 'OVERSIZED_EXTERIOR_DOOR'],
  [/\b(exterior|front|entry)\s+door/i, 'STANDARD_EXTERIOR_DOOR'],
  // Deck
  [/\b(rebuild|replace\s+section|major).*deck/i, 'DECK_SECTION_REBUILD'],
  [/\bdeck.*(rebuild|replace\s+section|major)/i, 'DECK_SECTION_REBUILD'],
  [/\b(board|plank|surface).*deck/i, 'DECK_BOARD_REPLACEMENT'],
  [/\bdeck.*(board|plank|surface|rot)/i, 'DECK_BOARD_REPLACEMENT'],
  [/\bdeck/i, 'DECK_STRUCTURAL_REPAIR'],
  // Fence
  [/\b(rebuild|replace\s+section|major).*fence/i, 'FENCE_SECTION_REBUILD'],
  [/\bfence.*(rebuild|replace\s+section|major)/i, 'FENCE_SECTION_REBUILD'],
  [/\b(lean|post|straighten).*fence/i, 'FENCE_POST_RESET'],
  [/\bfence.*(lean|post|straighten)/i, 'FENCE_POST_RESET'],
  [/\bfence/i, 'FENCE_PANEL_REPLACEMENT'],
  // TV
  [/\b(conceal|hide|in.?wall|wire).*\b(tv|mount)/i, 'TV_MOUNT_CONCEALED_WIRING'],
  [/\b(fireplace|mantle|above\s+fire).*\b(tv|mount)/i, 'TV_MOUNT_ABOVE_FIREPLACE'],
  [/\b(tv|mount).*\b(fireplace|mantle|above\s+fire)/i, 'TV_MOUNT_ABOVE_FIREPLACE'],
  [/\b(tv\s+(mount|install|hang|wall)|wall\s+mount|mount\s+(a\s+)?\d*\s*(?:inch\s+)?tv|mount\s+tv)/i, 'STANDARD_TV_MOUNT'],
];

export function extractJobFactsStub(input: ExtractionInput): ExtractionResult {
  const text = `${input.description} ${input.customerNotes ?? ''}`;

  // Detect trade contexts
  const tradeContexts: string[] = [];
  for (const [trade, regex] of TRADE_PATTERNS) {
    if (regex.test(text) && !tradeContexts.includes(trade)) {
      tradeContexts.push(trade);
    }
  }
  if (tradeContexts.length === 0) tradeContexts.push('general_handyman');

  // Detect assembly candidate
  let assemblyCandidate: string | null = null;
  let assemblyConfidence = 0;
  for (const [regex, code] of ASSEMBLY_PATTERNS) {
    if (regex.test(text)) {
      assemblyCandidate = code;
      assemblyConfidence = 0.85;
      break;
    }
  }

  // Build task list from keywords
  const tasks: ExtractedTask[] = [];

  // Common task detection
  if (/\b(remov|tear|rip|pull)\b/i.test(text)) {
    tasks.push({ component: 'remove_existing_material', quantity: 1, complexity: 'standard', confidence: 0.80, source: 'inferred' });
  }
  if (/\b(patch|fill|hole)/i.test(text)) {
    tasks.push({ component: 'patch_surface', quantity: 1, complexity: 'standard', confidence: 0.80, source: 'inferred' });
  }
  if (/\b(tape|mud|joint\s+compound)/i.test(text)) {
    tasks.push({ component: 'tape_and_mud', quantity: 1, complexity: 'standard', confidence: 0.80, source: 'inferred' });
  }
  if (/\b(sand|smooth|finish)/i.test(text)) {
    tasks.push({ component: 'sand_and_finish', quantity: 1, complexity: 'standard', confidence: 0.75, source: 'inferred' });
  }
  if (/\b(paint|prime|touch.?up)/i.test(text)) {
    tasks.push({ component: 'paint_or_touchup', quantity: 1, complexity: 'standard', confidence: 0.75, source: 'inferred' });
  }
  if (/\b(caulk|seal|weather)/i.test(text)) {
    tasks.push({ component: 'seal_or_caulk', quantity: 1, complexity: 'standard', confidence: 0.80, source: 'inferred' });
  }
  if (/\b(install|hang|put\s+up)\b.*\b(trim|board|molding|baseboard)/i.test(text) || /\b(trim|board|molding|baseboard).*\b(install|replac)/i.test(text)) {
    tasks.push({ component: 'install_board_or_trim', quantity: 1, complexity: 'standard', confidence: 0.80, source: 'inferred' });
  }
  if (/\b(mount|hang)\b.*\b(tv|television|shelf|bracket)/i.test(text) || /\b(tv|television)\b.*\b(mount|hang|wall)/i.test(text)) {
    tasks.push({ component: 'mount_object', quantity: 1, complexity: 'standard', confidence: 0.85, source: 'inferred' });
  }
  if (/\b(faucet|fixture|light|outlet)\b.*\b(install|replac)/i.test(text) || /\b(install|replac).*\b(faucet|fixture|light)/i.test(text)) {
    tasks.push({ component: 'replace_fixture', quantity: 1, complexity: 'standard', confidence: 0.80, source: 'inferred' });
  }
  if (/\b(post)\b/i.test(text)) {
    const postMatch = text.match(/(\d+)\s+(?:\w+\s+)*?(?:post|posts)/i);
    const qty = postMatch ? parseInt(postMatch[1], 10) : 1;
    tasks.push({ component: 'set_post', quantity: qty, complexity: 'standard', confidence: 0.80, source: 'inferred' });
  }
  if (/\b(railing|rail|baluster)/i.test(text)) {
    const baluMatch = text.match(/(\d+)\s+(?:\w+\s+)*?(?:baluster|spindle)/i);
    tasks.push({ component: 'repair_railing', quantity: baluMatch ? parseInt(baluMatch[1], 10) : 1, complexity: 'standard', confidence: 0.75, source: 'inferred' });
  }
  if (/\b(deck\s+board|decking|deck\s+plank)/i.test(text)) {
    tasks.push({ component: 'install_decking', quantity: 1, complexity: 'standard', confidence: 0.75, source: 'inferred' });
  }
  if (/\b(joist|beam|ledger|structural)/i.test(text)) {
    tasks.push({ component: 'install_structural_lumber', quantity: 1, complexity: 'high', confidence: 0.70, source: 'inferred' });
  }
  if (/\b(stair|step|tread|riser|stringer)/i.test(text)) {
    tasks.push({ component: 'build_stairs', quantity: 1, complexity: 'standard', confidence: 0.70, source: 'inferred' });
  }
  if (/\b(drywall|sheetrock)\b/i.test(text) && !tasks.some(t => t.component === 'install_sheet_material')) {
    tasks.push({ component: 'install_sheet_material', quantity: 1, complexity: 'standard', confidence: 0.75, source: 'inferred' });
  }
  if (/\b(door)\b/i.test(text) && !tasks.some(t => t.component === 'replace_fixture')) {
    tasks.push({ component: 'replace_fixture', quantity: 1, complexity: 'standard', confidence: 0.75, source: 'inferred', notes: { fixtureType: 'door' } });
  }

  // If no tasks detected, add a generic task
  if (tasks.length === 0) {
    tasks.push({ component: 'site_setup', quantity: 1, complexity: 'standard', confidence: 0.50, source: 'inferred' });
  }

  // Detect conditions
  const conditions: string[] = [];
  if (/\bceiling\b/i.test(text)) conditions.push('overhead_work');
  if (/\btextur/i.test(text)) conditions.push('finish_matching');
  if (/\b(outlet|switch|electric)/i.test(text)) conditions.push('near_electrical');
  if (/\bwater\b/i.test(text)) conditions.push('water_damage');
  if (/\b(fireplace|mantle)/i.test(text)) conditions.push('second_floor_access');
  if (/\b(customer|i)\s+(bought|have|supply|supplies|already\s+have)/i.test(text)) conditions.push('customer_supplied_material');
  if (/\b(tight|narrow|crawl|confined)/i.test(text)) conditions.push('confined_access');
  if (/\b(slope|hill|steep|uneven)/i.test(text)) conditions.push('steep_terrain');

  // Unknowns
  const unknowns: string[] = ['hidden_conditions_behind_surface'];
  if (/\b(drywall|wall|plaster)/i.test(text)) unknowns.push('behind_wall_condition');
  if (/\b(deck|fence|post)/i.test(text)) unknowns.push('below_grade_condition');
  if (/\b(door|window)/i.test(text)) unknowns.push('frame_condition');

  const materialSupplyStatus = conditions.includes('customer_supplied_material')
    ? 'customer_supplied' as const
    : 'unknown' as const;

  return {
    tradeContexts,
    assemblyCandidate,
    assemblyConfidence,
    tasks,
    conditions,
    unknowns,
    materialSupplyStatus,
    overallConfidence: assemblyCandidate ? 0.80 : (tasks.length > 0 ? 0.65 : 0.20),
    rawDescription: input.description,
  };
}
