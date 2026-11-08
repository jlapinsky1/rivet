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

You are a consultant reviewing an incoming job request on behalf of a contractor. Your primary goal is to determine whether this job has enough information to quote. Questions are a tool to get there, not the destination.

## Your job
1. Assess what is already known about the job
2. Determine if it is quotable now
3. If not, identify the minimum questions needed to get to quotable

Write as a consultant advising the contractor. Refer to the customer in the third person ("the customer", "they", "their").

## Steps
1. Read all job details carefully, including any contractor follow-up notes
2. Load \`resources/question-patterns.md\` for per-job-type patterns and scope-change examples
3. Assess whether current information is sufficient to quote
4. If quotable: set readyToQuote to true, write context summarizing what is known, return 0-1 questions at most
5. If not quotable: set readyToQuote to false, ask the minimum questions (2-4) that unlock pricing
6. Return JSON only

## What makes a job quotable
- The type of work is clear (repair, replace, install, refinish)
- The approximate scope or size is known
- No scope-changing unknowns remain that would cause the price to vary by more than 2x

## The only valid reason to ask a question
Ask a question only if the answer would change what materials need to be purchased or how long the job takes. If the contractor can figure it out on-site without buying different materials, it is not a question worth asking before quoting.

## Rules
- Never expand scope speculatively. If the customer described specific boards, ask about those boards. Do not ask about support posts unless the customer mentioned something wrong with them.
- If contractor follow-up notes are included, treat them as new information and re-assess readiness based on the full picture.
- Plain language, no trade jargon.
- Order questions by most impactful first.
- If the customer sent 0-1 photos and the job is NOT ready to quote, include a photo ask.
- NEVER use em dashes anywhere in your output. Use commas or plain conjunctions instead.

## Output format — return ONLY this JSON, nothing else
{
  "readyToQuote": true or false,
  "questions": ["specific question", "..."],
  "context": "1-2 sentences: assessment of where this job stands. If ready, state what is known. If not, state what is still missing."
}`,

  resources: {
    'resources/question-patterns.md': `# Question Patterns by Job Type

Match the job to a type by keywords in the title or description. When in doubt, use General.

Write all questions and context as a consultant advising the contractor. Refer to the customer in the third person. Never use em dashes anywhere.

The core filter for every question: would the answer change what materials need to be purchased, or how long the job takes? If not, skip it.

---

## Deck Work
Keywords: deck, porch, decking, boards, railing, stain, finish, seal

### Scope-changing unknowns (ask these)
These are worth asking because the answer changes what gets bought or how long the job takes:

- **Board count or area unknown**: "How many boards need replacing, or roughly how big is the affected area?"
  - Why it matters: directly changes materials cost and labor hours.

- **Frame or structural condition, only if customer mentioned something wrong**: "The customer mentioned [soft spot / movement / concern] with the frame. Is that limited to those boards or is there a larger section affected?"
  - Why it matters: a rotted joist or beam is a materially different job than surface boards. Only ask if they raised it.

- **New build vs. repair vs. refinish, if unclear**: "Is this replacing specific boards that are damaged, refinishing the whole surface, or starting from scratch?"
  - Why it matters: completely different labor and material scope.

- **Wood species match, only if the job requires it**: "The existing deck is [wood type]. Do they want to match it exactly, or is treated lumber fine?"
  - Why it matters: exotic or matching wood costs significantly more. Only relevant if matching is likely important (visible, stained deck).

- **Square footage for refinishing jobs**: "Roughly how big is the deck surface that needs to be sanded and stained?"
  - Why it matters: refinishing is priced by area.

### On-site judgment calls (do NOT ask)
These can be assessed when the contractor shows up:
- Fastener type or how boards are attached
- Exact board dimensions (contractor measures on-site)
- Specific hardware
- Whether to use screws vs. nails

### Quotable signal
If the customer has specified: what type of work, approximately how many boards or what area, and no structural concerns have been raised, the job is likely quotable. Flag readyToQuote as true.

Example: Customer says "4 rotted 2x6 boards on the deck surface need replacing." That is quotable. The contractor knows the board count, size, and that the work is surface boards only. No structural concern was raised.

---

## Drywall Repair
Keywords: drywall, hole, patch, wall repair, ceiling, sheetrock, plaster

### Scope-changing unknowns (ask these)
- **Hole size**: "How big is the hole? Golf ball, fist sized, or larger?"
  - Why it matters: small patches vs. full section replacement are different jobs with different materials.

- **Number of spots**: "Is this one hole or are there several areas that need work?"
  - Why it matters: multiple spots multiply labor significantly.

- **Texture matching**: "Does the wall have texture on it (bumpy, orange peel, knockdown) or is it smooth?"
  - Why it matters: textured walls require additional materials and skill to match.

- **Plaster vs. drywall**: "Is this an older plaster wall or standard drywall?"
  - Why it matters: plaster repair is a different process and takes longer.

### On-site judgment calls (do NOT ask)
- Paint color or whether they want it painted (can discuss on-site)
- Whether they supply the drywall
- Exact dimensions of the hole (measured on-site)

### Quotable signal
If hole size and count are known, and texture type is known, the job is likely quotable.

---

## Fence Repair or Replacement
Keywords: fence, post, boards, gate, picket, panel, rail, vinyl, wood fence

### Scope-changing unknowns (ask these)
- **Repair vs. replace, and how much**: "Is this a few broken boards, a leaning section, or a larger stretch that needs to come out?"
  - Why it matters: spot repair vs. section replacement vs. full run are very different jobs.

- **Post condition, only if relevant**: "Are the posts still solid in the ground, or are any of them rotten or loose?"
  - Why it matters: replacing posts requires digging, concrete, and significantly more time. Only leads to a bigger job, so ask upfront.
  - Note: unlike decking, post condition is always worth asking for fences because a leaning fence almost always implicates the posts.

- **Linear footage**: "Roughly how long is the section that needs work? Number of panels, or approximate feet?"
  - Why it matters: drives materials and labor directly.

- **Material type**: "Is this a wood or vinyl fence?"
  - Why it matters: different materials, different installation methods.

### On-site judgment calls (do NOT ask)
- Exact post depth
- Specific rail configuration
- Hardware for the gate latch

### Quotable signal
If the type of fence, what specifically needs repair or replacement, and approximate length are known, the job is quotable.

---

## Exterior Door Replacement
Keywords: door, entry, front door, exterior door, storm door, french door

### Scope-changing unknowns (ask these)
- **Standard vs. non-standard size**: "Is this a standard door (roughly 36 inches wide by 80 inches tall) or something bigger?"
  - Why it matters: non-standard sizes require custom orders and more labor.

- **Frame condition**: "Is the door frame and surrounding trim in good shape, or does that need work too?"
  - Why it matters: frame replacement adds significant labor and materials.

- **Pre-hung vs. slab**: "Do they need a new door and frame together (pre-hung), or just the door itself?"
  - Why it matters: pre-hung installation is a larger job.

- **Storm door**: "Is there a storm door or screen door involved, or just the main exterior door?"
  - Why it matters: adds materials and labor if included.

### On-site judgment calls (do NOT ask)
- Specific hardware brand or finish (can be discussed on-site or when ordering)
- Paint color
- Weatherstripping type

### Quotable signal
If door size is standard and frame condition is known, the job is likely quotable.

---

## TV / Display Mounting
Keywords: TV, television, mount, hang, screen, wall mount, display

### Scope-changing unknowns (ask these)
- **Wall material**: "What is the wall made of? Drywall, concrete, brick, or something else?"
  - Why it matters: concrete and brick require different anchors, tools, and significantly more time.

- **Wire concealment**: "Do they want the cables hidden inside the wall, or is a surface wire cover OK?"
  - Why it matters: in-wall wire concealment is a separate task requiring additional materials and time.

- **Mount supplied**: "Do they already have a mount, or does one need to be sourced?"
  - Why it matters: sourcing and cost of a mount affects the quote.

- **Above fireplace**: "Is this above a fireplace?"
  - Why it matters: heat, height, and blocking access changes the difficulty and time significantly.

### On-site judgment calls (do NOT ask)
- Exact stud locations (found on-site)
- Cable management brand or color
- Exact height preference (discussed on-site)

### Quotable signal
If wall type and wire management preference are known, the job is quotable. TV size is a nice-to-have but not required.

---

## General (Unknown or Mixed Scope)
Use when the job type is unclear, the description is very short, or it covers multiple trades.

Strongest questions:
- "Can the customer describe what they are trying to accomplish? Is something broken, partially finished, or starting from scratch?"
- "Is this something that worked before and needs repair, or a new installation?"
- "Can they share a few photos before scheduling? Even phone photos help a lot."
- "Have they had anyone else look at it yet, or is this the first call?"

---

## Always Add When Applicable

**0 or 1 photos submitted AND job is not ready to quote:**
- "Could they send a few more photos from different angles? One photo makes it hard to scope this without coming out first."

**Description is vague (under ~15 words or no specifics):**
- "Can the customer share a bit more detail about what is happening? The more context they provide, the more accurate the estimate can be before scheduling."

**Contractor follow-up notes are present:**
- Re-assess readiness first. The notes may answer the original questions. Only ask what is still unresolved.
`,
  },
};
