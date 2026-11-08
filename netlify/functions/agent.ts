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

import { jsonResponse, errorResponse } from './_shared/supabase.js';
import { getServiceClient } from './_shared/supabase.js';
import { runScopeAnalysis } from './_shared/agent/runScopeAnalysis';

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

      // ─── refresh-scope ───────────────────────────────────────────────────
      // Saves contractor_notes (if provided), re-runs agent, updates scope_analysis.
      // Called from the drawer when notes are saved or when generating for the first time.
      case 'refresh-scope': {
        const { workItemId, contractorNotes } = body as {
          workItemId?: number;
          contractorNotes?: string;
        };
        if (!workItemId) return errorResponse('workItemId is required');

        const supabase = getServiceClient();

        // Persist notes if provided
        if (typeof contractorNotes === 'string') {
          await supabase
            .from('work_items')
            .update({ contractor_notes: contractorNotes })
            .eq('id', workItemId)
            .eq('business_id', businessId);
        }

        // Run agent and write scope_analysis to DB
        await runScopeAnalysis(workItemId, businessId);

        // Return the updated analysis
        const { data: item } = await supabase
          .from('work_items')
          .select('scope_analysis, contractor_notes')
          .eq('id', workItemId)
          .eq('business_id', businessId)
          .single();

        return jsonResponse({
          scopeAnalysis: item?.scope_analysis ?? { questions: [], context: '' },
          contractorNotes: item?.contractor_notes ?? '',
        });
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
