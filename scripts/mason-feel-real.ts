/**
 * Re-runs every Mason demo job through the current estimator + decision engine
 * and writes a feel-real checklist you can mark up in the truck.
 *
 *   npx tsx scripts/mason-feel-real.ts
 *
 * Also regenerates supabase/seed-data.sql so a re-seed picks up new recs.
 */

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { demoWorkItems, demoBusinessConfig, demoEstimationRuns } from '../src/demo/seed';
import { applyLiveRecommendations } from '../src/estimator/applyLiveRecommendations';
import { buildDecisionContext } from '../src/estimator/weekContext';

const __dirname = dirname(fileURLToPath(import.meta.url));

const settings = {
  weeklyGoal: demoBusinessConfig.weeklyEarningsGoal,
  weeklyHours: demoBusinessConfig.weeklyCapacityHours,
  minimumHourlyRate: demoBusinessConfig.minimumHourlyRate,
  minimumPrice: demoBusinessConfig.minimumJobPrice,
  minimumJobProfit: demoBusinessConfig.profitFloorAbsolute,
  minimumMargin: demoBusinessConfig.marginFloorPercent,
  mileageRate: demoBusinessConfig.mileageRate,
  materialMarkup: demoBusinessConfig.materialMarkupPercent,
};

const live = applyLiveRecommendations(
  demoWorkItems,
  demoEstimationRuns,
  settings,
  demoBusinessConfig.businessId,
);

const liveCtx = buildDecisionContext(
  demoWorkItems.map(w => ({
    opStatus: w.opStatus,
    profit: w.profit,
    hoursNum: w.hoursNum,
    countsTowardCurrentWeek: w.countsTowardCurrentWeek,
  })),
  { weeklyGoal: 2500, weeklyHours: 35 },
);

function mix(items: typeof live) {
  const counts = { take: 0, take_at_price: 0, review: 0, pass: 0 };
  for (const item of items) {
    counts[item.recommendation] = (counts[item.recommendation] || 0) + 1;
  }
  return counts;
}

const storedMix = mix(demoWorkItems);
const liveMix = mix(live);

const lines: string[] = [];
function ln(s = '') { lines.push(s); }

function table(items: typeof live) {
  ln('| ID | Status | Title | Rec | Quote | Send $ | Conf | First reason | Feel? |');
  ln('| --- | --- | --- | --- | ---: | ---: | ---: | --- | --- |');
  for (const item of items) {
    const reason = (item.reasons[0]?.text || '').replace(/\|/g, '/');
    const send = item.suggestedPrice != null ? `$${item.suggestedPrice}` : '—';
    ln(`| ${item.id} | ${item.opStatus} | ${item.title} | **${item.recommendation}** | $${item.price} | ${send} | ${item.confidence}% | ${reason} | |`);
  }
}

ln('# Mason feel-real recs');
ln('');
ln(`Generated: ${new Date().toISOString()}`);
ln('');
ln('Every row was produced by `estimateHandymanJob` → `applyCalibration` → `deriveRecommendation`.');
ln('Use the **Feel?** column: Agree / Too high / Too low / Wrong call.');
ln('');
ln('## 1. Stored intake recs (frozen Tuesday week clock)');
ln('');
ln('This is what seed writes and what Mason sees at intake: **$1800 earned, 24h left, $29 needed / schedule hour**.');
ln('');
ln(`| Take | Take at price | Review | Pass |`);
ln(`| ---: | ---: | ---: | ---: |`);
ln(`| ${storedMix.take} | ${storedMix.take_at_price} | ${storedMix.review} | ${storedMix.pass} |`);
ln('');
table(demoWorkItems);
ln('');
ln('## 2. Live recs for pending jobs (this week only)');
ln('');
ln('August completed jobs are off the week clock. Committed hours are scheduled / in-progress / approved only.');
ln('');
ln(`- Earned this week: $${liveCtx.weeklyEarningsToDate}`);
ln(`- Hours left (35 − committed): ${liveCtx.remainingCapacityHours}h`);
ln(`- Needed $/schedule hour: $${liveCtx.requiredContributionPerCapacityHour}`);
ln('');
ln(`| Take | Take at price | Review | Pass |`);
ln(`| ---: | ---: | ---: | ---: |`);
ln(`| ${liveMix.take} | ${liveMix.take_at_price} | ${liveMix.review} | ${liveMix.pass} |`);
ln('');
ln('Pending `needs_review` rows are recomputed. Other statuses keep the stored label.');
ln('');
table(live);
ln('');
ln('## How to re-seed Mason in Supabase');
ln('');
ln('1. `npx tsx supabase/generate-seed-sql.ts` (rewrites `supabase/seed-data.sql` from current engine output)');
ln('2. Re-run `supabase/seed-data.sql` against the Mason business after wiping prior Mason work_items / estimation_runs if you need a clean replace.');
ln('');

const outPath = join(__dirname, '..', 'docs', 'MASON_FEEL_REAL.md');
writeFileSync(outPath, lines.join('\n') + '\n');
console.log(lines.join('\n'));
console.log(`\nWrote ${outPath}`);
