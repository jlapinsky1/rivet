/**
 * Replay Mason (or any SimJob set) through the decision engine
 * at Monday / midweek / Friday week clocks.
 *
 *   npm run sim
 *   npx tsx scripts/simulate-handyman.ts --goal 3000 --hours 40
 *
 * Uses local seed jobs + owner override / quoted-price logs.
 * Does not call Supabase.
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  demoAdjustments,
  demoBusinessConfig,
  demoEstimationRuns,
  demoOutcomes,
  demoOwnerDecisions,
  demoWorkItems,
} from '../src/demo/seed';
import {
  MASON_SOLO_BUDGET,
  renderSimulationMarkdown,
  runSimulation,
  type SoloHandymanBudget,
} from '../src/estimator/simulate';

const __dirname = dirname(fileURLToPath(import.meta.url));

function argNum(flag: string): number | undefined {
  const i = process.argv.indexOf(flag);
  if (i < 0 || !process.argv[i + 1]) return undefined;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : undefined;
}

const budget: SoloHandymanBudget = {
  ...MASON_SOLO_BUDGET,
  weeklyGoal: argNum('--goal') ?? MASON_SOLO_BUDGET.weeklyGoal,
  weeklyHours: argNum('--hours') ?? MASON_SOLO_BUDGET.weeklyHours,
};

const jobs = demoWorkItems.map((item) => {
  const run = demoEstimationRuns.find(r => r.id === item.estimationRunId || r.workId === item.id);
  if (!run?.economicJob) {
    throw new Error(`No estimation run for work item ${item.id}`);
  }
  return {
    id: String(item.id),
    title: item.title,
    economicJob: run.economicJob,
    runId: run.id,
  };
});

const report = runSimulation(jobs, budget, {
  businessId: demoBusinessConfig.businessId,
  feedback: {
    decisions: demoOwnerDecisions,
    adjustments: demoAdjustments,
    outcomes: demoOutcomes,
  },
});

const md = renderSimulationMarkdown(report);
const outMd = join(__dirname, '..', 'docs', 'SIMULATION.md');
const outJson = join(__dirname, '..', 'docs', 'simulation.json');
writeFileSync(outMd, md + '\n');
writeFileSync(outJson, JSON.stringify(report, null, 2) + '\n');
console.log(md);
console.log(`\nWrote ${outMd}`);
console.log(`Wrote ${outJson}`);
