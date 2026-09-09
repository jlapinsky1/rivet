import Anthropic from '@anthropic-ai/sdk';

// This runs server-side only. ANTHROPIC_API_KEY is a Netlify server env var,
// never exposed to browser code.

const PROMPT_VERSION = '0.2.0';
const AI_MODEL = 'claude-sonnet-4-20250514';

const EXTRACTION_PROMPT = `You are Rivet's handyman job intake extractor. Your job is to identify what work needs to happen and extract structured facts from a customer's description and photos.

You will work through three phases in order.

## PHASE 1: Visual Extraction
Look at the photos and description. State ONLY what you can physically observe:
- Identify materials, surfaces, and conditions
- Estimate physical dimensions as approximate (e.g., "roughly 6 inches"). For the JSON output, use DimensionEstimate objects with confidence "estimated_from_photo".
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
- component: the component code
- quantity: number of units
- quantityUnit: optional unit description
- complexity: low, standard, or high
- confidence: 0-1
- source: observed, inferred, or customer_reported
- notes: optional object with extra context (e.g. {"fixtureType": "faucet"})

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
- tasks: array of task objects
- conditions: array of condition codes
- unknowns: array of things you cannot determine
- materialSupplyStatus: "customer_supplied", "contractor_supplied", or "unknown"
- overallConfidence: number 0-1

Do NOT return labor hours, material costs, prices, profit, or Take/Review/Pass recommendations.`;

export async function handler(event: { body: string | null }) {
  if (!event.body) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing request body' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured' }) };
  }

  try {
    const { description, photos, customerNotes } = JSON.parse(event.body);

    const client = new Anthropic({ apiKey });

    const userContent: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

    if (photos && Array.isArray(photos)) {
      for (const photo of photos) {
        if (photo.startsWith('data:')) {
          const match = photo.match(/^data:(image\/\w+);base64,(.+)$/);
          if (match) {
            userContent.push({
              type: 'image',
              source: { type: 'base64', media_type: match[1] as 'image/jpeg', data: match[2] },
            });
          }
        } else {
          userContent.push({
            type: 'image',
            source: { type: 'url', url: photo },
          });
        }
      }
    }

    let textContent = `Customer description: ${description}`;
    if (customerNotes) textContent += `\n\nCustomer notes: ${customerNotes}`;
    userContent.push({ type: 'text', text: textContent });

    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 1024,
      system: EXTRACTION_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') {
      return { statusCode: 500, body: JSON.stringify({ error: 'No text in AI response' }) };
    }

    let jsonText = textBlock.text.trim();
    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) jsonText = codeBlockMatch[1];

    const result = JSON.parse(jsonText);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...result,
        _meta: { model: AI_MODEL, promptVersion: PROMPT_VERSION },
      }),
    };
  } catch (err) {
    console.error('Extraction error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Extraction failed', detail: String(err) }),
    };
  }
}
