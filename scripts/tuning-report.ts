/**
 * Weekly miss report from owner_decisions.
 *
 *   npm run tune-report -- --demo
 *   npm run tune-report
 *
 * Demo uses Mason seed decisions (all dates). Live pulls last 7 days from Supabase.
 * Optional Claude notes if ANTHROPIC_API_KEY is set — never used for hours or prices.
 */

import { writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { demoEstimationRuns, demoOwnerDecisions } from '../src/demo/seed';
import {
  buildTuningReport,
  renderTuningReportMarkdown,
  weekWindow,
  type TuningEvent,
} from '../src/estimator/tuningReport';

const __dirname = dirname(fileURLToPath(import.meta.url));

function eventsFromSeed(): TuningEvent[] {
  const familyByRun = new Map(demoEstimationRuns.map(r => [r.id, r.projectFamily]));
  return demoOwnerDecisions.map(d => ({
    decidedAt: d.decidedAt,
    businessId: d.businessId,
    projectFamily: familyByRun.get(d.estimationRunId) ?? 'unknown',
    rec: d.rivetRecommendation,
    action: d.ownerAction,
    reasonCode: d.reasonCode,
    rivetPrice: d.rivetPrice,
    ownerPrice: d.ownerPrice,
  }));
}

async function eventsFromSupabase(since: Date): Promise<TuningEvent[]> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Need SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_ fallbacks)');

  const supabase = createClient(url, key);
  const { data: decisions, error } = await supabase
    .from('owner_decisions')
    .select('estimation_run_id, business_id, rivet_recommendation, owner_action, reason_code, rivet_price, owner_price, decided_at')
    .gte('decided_at', since.toISOString());
  if (error) throw new Error(error.message);

  const runIds = [...new Set((decisions ?? []).map(d => d.estimation_run_id as string))];
  const familyByRun = new Map<string, string>();
  if (runIds.length) {
    const { data: runs } = await supabase
      .from('estimation_runs')
      .select('id, project_family')
      .in('id', runIds);
    for (const r of runs ?? []) familyByRun.set(r.id as string, r.project_family as string);
  }

  return (decisions ?? []).map(d => ({
    decidedAt: d.decided_at as string,
    businessId: d.business_id as string,
    projectFamily: familyByRun.get(d.estimation_run_id as string) ?? 'unknown',
    rec: d.rivet_recommendation as TuningEvent['rec'],
    action: d.owner_action as TuningEvent['action'],
    reasonCode: (d.reason_code as TuningEvent['reasonCode']) ?? undefined,
    rivetPrice: Number(d.rivet_price),
    ownerPrice: d.owner_price == null ? null : Number(d.owner_price),
  }));
}

async function optionalNarrative(markdown: string): Promise<string | undefined> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return undefined;
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: key });
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system:
      'You review Rivet handyman rec misses. Suggest what a human should inspect in assemblies or decision rules. Never invent hours, costs, or prices. 5 short bullets max.',
    messages: [{ role: 'user', content: markdown }],
  });
  const block = msg.content.find(b => b.type === 'text');
  return block && block.type === 'text' ? block.text : undefined;
}

async function main() {
  const demo = process.argv.includes('--demo');
  const until = new Date();
  const since = demo ? new Date('2020-01-01T00:00:00Z') : weekWindow(until).since;
  const events = demo ? eventsFromSeed() : await eventsFromSupabase(since);
  const report = buildTuningReport(events, since, until);
  const skeleton = renderTuningReportMarkdown(report);
  let narrative: string | undefined;
  try {
    narrative = await optionalNarrative(skeleton);
  } catch (err) {
    console.warn('Claude notes skipped:', err instanceof Error ? err.message : err);
  }
  const md = renderTuningReportMarkdown(report, narrative);
  const out = join(__dirname, '../docs/TUNING_REPORT.md');
  writeFileSync(out, md);
  console.log(md);
  console.log(`Wrote ${out}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
