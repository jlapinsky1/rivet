/**
 * agent.ts — Rivet Agent Function
 *
 * POST /.netlify/functions/agent
 * Body: { task, businessId, ...taskInput }
 *
 * Routes tasks to the right agent and returns structured output.
 * The UI is just a consumer of this endpoint — same as MCP or any other channel.
 *
 * Adding a new agent capability:
 *   1. Create a skill in _shared/agent/skills/
 *   2. Create or update an agent in _shared/agent/agents/
 *   3. Import the agent file below
 *   4. Add the task case in the router
 */

// Bootstrap: register tools and agents (side-effect imports)
import './_shared/agent/tools/index';
import './_shared/agent/agents/jobAdvisor';

import { getAgent } from './_shared/agent/registry/agentRegistry';
import { runAgent } from './_shared/agent/loop';
import { jsonResponse, errorResponse } from './_shared/supabase.js';

// ─── Task: clarify-scope ─────────────────────────────────────────────────────

interface ClarifyScopeInput {
  task: 'clarify-scope';
  businessId: string;
  jobTitle: string;
  customerDescription?: string;
  customerNotes?: string;
  photoCount: number;
  lookFirst?: string;
}

function buildScopeMessage(input: Omit<ClarifyScopeInput, 'task' | 'businessId'>): string {
  const lines = [`Job: ${input.jobTitle}`];
  if (input.customerDescription) lines.push(`Customer description: ${input.customerDescription}`);
  if (input.customerNotes && input.customerNotes !== input.customerDescription) {
    lines.push(`Additional notes: ${input.customerNotes}`);
  }
  lines.push(`Photos submitted: ${input.photoCount}`);
  if (input.lookFirst) lines.push(`Known gap: ${input.lookFirst}`);
  return lines.join('\n');
}

// ─── Router ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return errorResponse('Invalid JSON body');
  }

  const { task, businessId } = body as { task?: string; businessId?: string };
  if (!task) return errorResponse('task is required');
  if (!businessId) return errorResponse('businessId is required');

  try {
    switch (task) {
      case 'clarify-scope': {
        const input = body as ClarifyScopeInput;
        const agent = getAgent('job-advisor');
        if (!agent) return errorResponse('Agent not found', 500);

        const result = await runAgent(
          agent,
          buildScopeMessage(input),
          { businessId },
        );

        if (result.error && !result.output) {
          return errorResponse(`Agent error: ${result.error}`, 500);
        }

        // Parse JSON from agent output — Haiku returns raw JSON text
        let parsed: { questions: string[]; context: string };
        try {
          const match = result.output.match(/\{[\s\S]*\}/);
          parsed = JSON.parse(match?.[0] ?? result.output);
          if (!Array.isArray(parsed.questions)) parsed.questions = [];
        } catch {
          parsed = { questions: [], context: result.output };
        }

        return jsonResponse(parsed);
      }

      default:
        return errorResponse(`Unknown task: ${task}`);
    }
  } catch (err) {
    console.error(`[agent] task=${task} error:`, err);
    return errorResponse(
      `Agent failed: ${err instanceof Error ? err.message : String(err)}`,
      500,
    );
  }
}
