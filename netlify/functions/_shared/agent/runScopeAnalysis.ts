/**
 * runScopeAnalysis — server-side helper
 *
 * Fetches a work item, runs the job-advisor agent, and writes scope_analysis
 * back to the DB. Called at job creation time and when contractor notes are saved.
 *
 * Not an HTTP endpoint — import and call directly from other functions.
 */

// Bootstrap registrations (safe to import multiple times — registry is a module singleton)
import './tools/index';
import './agents/jobAdvisor';

import { getAgent } from './registry/agentRegistry';
import { runAgent } from './loop';
import { getServiceClient } from '../supabase.js';

export async function runScopeAnalysis(workItemId: number, businessId: string): Promise<void> {
  const supabase = getServiceClient();

  const { data: item } = await supabase
    .from('work_items')
    .select('title, description, customer_notes, photos, contractor_notes')
    .eq('id', workItemId)
    .eq('business_id', businessId)
    .single();

  if (!item) return;

  const agent = getAgent('job-advisor');
  if (!agent) return;

  const lines = [`Job: ${item.title}`];
  if (item.description) lines.push(`Customer description: ${item.description}`);
  if (item.customer_notes && item.customer_notes !== item.description) {
    lines.push(`Additional notes: ${item.customer_notes}`);
  }
  lines.push(`Photos submitted: ${(item.photos as string[]).length}`);
  if (item.contractor_notes) {
    lines.push(`Contractor follow-up notes: ${item.contractor_notes}`);
  }

  const result = await runAgent(agent, lines.join('\n'), { businessId });

  if (result.error && !result.output) return;

  let parsed: { questions: string[]; context: string };
  try {
    const match = result.output.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(match?.[0] ?? result.output);
    if (!Array.isArray(parsed.questions)) parsed.questions = [];
  } catch {
    return; // Don't store garbage
  }

  await supabase
    .from('work_items')
    .update({ scope_analysis: parsed })
    .eq('id', workItemId)
    .eq('business_id', businessId);
}
