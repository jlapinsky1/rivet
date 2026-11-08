import type { Skill } from '../types';

/**
 * scope-clarifier skill
 *
 * Logic lives in resources/question-patterns.md — not in this file.
 * To change what questions get asked for a job type, edit the resource file.
 */
export const scopeClarifierSkill: Skill = {
  name: 'scope-clarifier',
  description:
    'Generates specific questions to ask a customer before quoting a job that cannot be priced remotely.',

  instructions: `# Scope Clarifier

You are reviewing an incoming job request that cannot be quoted without more information from the customer.

## Your job
Generate 3–5 specific, practical questions this contractor needs answered before they can price this job. Not generic questions — questions tuned to what this customer actually described and what's missing.

## Steps
1. Read the job details carefully
2. Load \`resources/question-patterns.md\` for per-job-type question patterns
3. Match the job to the right pattern (or use General if unclear)
4. Select the 3–5 most impactful questions for this specific request
5. Return JSON only — no explanation text outside the JSON

## Rules
- Questions must be specific to what was described, not boilerplate
- Each question unlocks a different dimension: type of work, size, condition, material, complexity
- Plain language — no trade jargon the customer won't understand
- Order by most impactful first
- If the customer sent 0–1 photos, always include a photo ask
- If the description is vague (under ~15 words), always ask for more detail

## Output format — return ONLY this JSON, nothing else
{
  "questions": ["specific question", "specific question", "..."],
  "context": "1–2 sentences: what is unclear and why these questions matter before quoting"
}`,

  resources: {
    'resources/question-patterns.md': `# Question Patterns by Job Type

Match the job to a type by keywords in the title or description. When in doubt, use General.

---

## Deck Work
Keywords: deck, porch, decking, boards, railing, stain, finish, seal

Key unknowns before quoting: new build vs repair vs refinishing, board condition, structural integrity, square footage, material preference.

Strongest questions (pick the most relevant):
- "Is the deck fully built and needs work done to it, or does something need to be built from scratch?"
- "Are the boards rotted or just worn — do you know if the frame underneath is solid?"
- "Roughly how big is the deck — maybe how many people it fits, or dimensions if you know?"
- "Do you want to match the existing wood, or are you open to composite decking?"
- "Has this deck had any structural repairs before, or has it just been surface maintenance?"
- "Is this staining, sealing, or painting — or do boards need to be replaced first?"

---

## Drywall Repair
Keywords: drywall, hole, patch, wall repair, ceiling, sheetrock, plaster

Key unknowns: hole size, number of spots, texture matching, finish level needed.

Strongest questions:
- "How big is the hole — golf ball sized, fist sized, or larger?"
- "Is this one spot or are there multiple areas?"
- "Does the wall have texture on it — bumpy, orange peel, knockdown — or is it smooth?"
- "Is this in a high-visibility area where matching exactly matters, or somewhere close-enough is fine?"
- "Is this drywall or plaster — do you know?"

---

## Fence Repair or Replacement
Keywords: fence, post, boards, gate, picket, panel, rail, vinyl, wood fence

Key unknowns: repair vs full replace, post condition, length of section, material type.

Strongest questions:
- "Is this a few broken boards, a leaning section, or is a larger stretch in rough shape?"
- "Are the posts still solid in the ground, or are they rotten or loose?"
- "How long is the section that needs work — number of panels, or approximate feet if you know?"
- "Wood or vinyl fence? And do you want to match what's there, or is a different material OK?"
- "Is the gate still functional, or does that need attention too?"

---

## Exterior Door Replacement
Keywords: door, entry, front door, exterior door, storm door, french door

Key unknowns: standard vs non-standard size, frame condition, pre-hung vs slab, hardware.

Strongest questions:
- "Is this a standard door — roughly 36 inches wide by 80 inches tall — or something bigger?"
- "Is the door frame and surrounding trim in good shape, or does that need work too?"
- "Do you need a new door and frame together (pre-hung), or just the door slab itself?"
- "Any specific hardware in mind — deadbolt, handleset — or is that part of what you need help with?"
- "Is there a storm door or screen door involved, or just the main exterior door?"

---

## TV / Display Mounting
Keywords: TV, television, mount, hang, screen, wall mount, display

Key unknowns: wall type, TV size, wire management preference, stud situation, height/location.

Strongest questions:
- "What is the wall made of — drywall, concrete, brick, or something else?"
- "How big is the TV?"
- "Do you want the cables hidden inside the wall, or is a surface wire cover acceptable?"
- "Is this above a fireplace or in a standard location on the wall?"
- "Do you have a mount already, or do you need one sourced?"

---

## General (Unknown or Mixed Scope)
Use when the job type is unclear, the description is very short, or it covers multiple trades.

Strongest questions:
- "Can you describe what you are trying to accomplish — is something broken, partially finished, or starting from scratch?"
- "Is this something that worked before and needs repair, or a new installation?"
- "Any chance you could share a few photos before I come out — even from your phone helps a lot?"
- "Have you had anyone else look at it yet, or is this the first call?"
- "Roughly how urgent is this — same week, or flexible on timing?"

---

## Always Add When Applicable

**0 or 1 photos submitted:**
- "Could you send a few more photos from different angles? One photo makes it hard to price without coming out first."

**Description is vague (under ~15 words or no specifics):**
- "Can you tell me a bit more about what's happening — the more detail, the more accurate I can be before we schedule anything."

**Customer description mentions they don't know something:**
- Prioritize questions that fill that specific gap rather than general ones.
`,
  },
};
