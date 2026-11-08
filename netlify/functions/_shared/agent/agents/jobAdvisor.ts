/**
 * Job Advisor — reviews incoming job requests.
 *
 * Task: clarify-scope
 * Model: Haiku (single-pass, skill pre-loaded, no tool calls)
 * Skill: scope-clarifier
 *
 * The scope-clarifier skill contains all the logic for what to ask.
 * This file is configuration only — no business rules here.
 */

import type { Agent } from '../types';
import { registerSkill } from '../registry/skillRegistry';
import { registerAgent } from '../registry/agentRegistry';
import { scopeClarifierSkill } from '../skills/scopeClarifier';

registerSkill(scopeClarifierSkill);

export const jobAdvisor: Agent = {
  id: 'job-advisor',
  name: 'Job Advisor',
  instructions: `You review incoming job requests for a handyman business owner.
Your job is to identify what information is missing before this job can be quoted, and generate specific questions to ask the customer.
Load the scope-clarifier skill, apply the right question pattern for this job type, and return a JSON object with "questions" (array of 3–5 strings) and "context" (1–2 sentence explanation of what's unclear).
Return ONLY valid JSON. No text before or after the JSON.`,
  skills: ['scope-clarifier'],
  tools: [],   // Haiku: no tool calling, skill content pre-injected into system prompt
  model: 'haiku',
};

registerAgent(jobAdvisor);
