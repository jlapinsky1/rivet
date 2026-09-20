import type {
  ActualOutcome,
  AdjustmentEntry,
  BusinessEconomicsConfig,
  DecisionContext,
  EconomicJob,
  OwnerDecision,
  Recommendation,
} from './types';
import { deriveRecommendation } from './decision';
import { refreshEconomicJobForContext } from './estimator';
import { truckHeadline, truckSentence } from './truckCopy';

export type SoloHandymanBudget = {
  weeklyGoal: number;
  weeklyHours: number;
  minimumHourlyRate: number;
  minimumJobPrice: number;
  profitFloorAbsolute: number;
  marginFloorPercent: number;
  ownerOpportunityRatePerHour: number;
  mileageRate: number;
  materialMarkupPercent: number;
  confidenceThreshold: number;
};

export type WeekScenarioId = 'monday' | 'midweek' | 'friday';

export type WeekScenario = {
  id: WeekScenarioId;
  label: string;
  earned: number;
  remainingHours: number;
};

export type SimJob = {
  id: string;
  title: string;
  economicJob: EconomicJob;
  runId?: string;
};

export type JobFeedback = {
  decisions: OwnerDecision[];
  adjustments: AdjustmentEntry[];
  outcomes: ActualOutcome[];
};

export type SimulatedJobRow = {
  id: string;
  title: string;
  recommendation: Recommendation;
  quote: number;
  sendPrice: number | null;
  floor: number;
  confidence: number;
  firstReason: string;
  lookFirst: string | null;
  truck: string;
  truckLine: string;
  walkAwayPrice: number | null;
  ownerAction: string | null;
  ownerQuoted: number | null;
  rivetPriceThen: number | null;
  overrideNote: string | null;
};

export type ScenarioResult = {
  scenario: WeekScenario;
  context: DecisionContext;
  mix: Record<Recommendation, number>;
  jobs: SimulatedJobRow[];
};

export type SimulationReport = {
  generatedAt: string;
  budget: SoloHandymanBudget;
  scenarios: ScenarioResult[];
  recChanges: { id: string; title: string; monday: Recommendation; midweek: Recommendation; friday: Recommendation }[];
};

export const MASON_SOLO_BUDGET: SoloHandymanBudget = {
  weeklyGoal: 2500,
  weeklyHours: 35,
  minimumHourlyRate: 70,
  minimumJobPrice: 175,
  profitFloorAbsolute: 75,
  marginFloorPercent: 35,
  ownerOpportunityRatePerHour: 75,
  mileageRate: 0.70,
  materialMarkupPercent: 20,
  confidenceThreshold: 0.70,
};

/** Monday empty / Tuesday on pace / Friday behind with 6h left. */
export function defaultWeekScenarios(budget: SoloHandymanBudget): WeekScenario[] {
  const goal = budget.weeklyGoal;
  const hours = budget.weeklyHours;
  return [
    { id: 'monday', label: 'Monday — empty week', earned: 0, remainingHours: hours },
    { id: 'midweek', label: 'Midweek — on pace', earned: Math.round(goal * 0.72), remainingHours: Math.round(hours * 0.69) },
    { id: 'friday', label: 'Friday — behind, hours left scarce', earned: Math.round(goal * 0.76), remainingHours: 6 },
  ];
}

export function contextFromWeekPosition(
  budget: SoloHandymanBudget,
  earned: number,
  remainingHours: number,
): DecisionContext {
  const remaining = Math.max(0, remainingHours);
  const gap = Math.max(0, budget.weeklyGoal - earned);
  return {
    weeklyEarningsToDate: earned,
    remainingCapacityHours: remaining,
    pipelineValue: 0,
    pipelineHours: 0,
    requiredContributionPerCapacityHour: remaining > 0 ? round2(gap / remaining) : 0,
  };
}

export function budgetToConfig(budget: SoloHandymanBudget, businessId: string): BusinessEconomicsConfig {
  return {
    businessId,
    ownerOpportunityRatePerHour: budget.ownerOpportunityRatePerHour,
    helperCashRatePerHour: 30,
    mileageRate: budget.mileageRate,
    materialMarkupPercent: budget.materialMarkupPercent,
    minimumJobPrice: budget.minimumJobPrice,
    minimumHourlyRate: budget.minimumHourlyRate,
    profitFloorAbsolute: budget.profitFloorAbsolute,
    marginFloorPercent: budget.marginFloorPercent,
    confidenceThreshold: budget.confidenceThreshold,
    weeklyEarningsGoal: budget.weeklyGoal,
    weeklyCapacityHours: budget.weeklyHours,
  };
}

export function runSimulation(
  jobs: SimJob[],
  budget: SoloHandymanBudget,
  opts?: {
    businessId?: string;
    scenarios?: WeekScenario[];
    feedback?: JobFeedback;
  },
): SimulationReport {
  const businessId = opts?.businessId ?? 'sim';
  const config = budgetToConfig(budget, businessId);
  const scenarios = opts?.scenarios ?? defaultWeekScenarios(budget);
  const feedback = opts?.feedback;

  const decisionsByRun = new Map((feedback?.decisions ?? []).map(d => [d.estimationRunId, d]));
  const outcomesByRun = new Map((feedback?.outcomes ?? []).map(o => [o.estimationRunId, o]));
  const adjsByRun = groupBy(feedback?.adjustments ?? [], a => a.estimationRunId);

  const scenarioResults: ScenarioResult[] = scenarios.map((scenario) => {
    const context = contextFromWeekPosition(budget, scenario.earned, scenario.remainingHours);
    const mix: Record<Recommendation, number> = { take: 0, take_at_price: 0, review: 0, pass: 0 };
    const rows: SimulatedJobRow[] = jobs.map((job) => {
      const live = refreshEconomicJobForContext(job.economicJob, config, context);
      const decision = deriveRecommendation(live, config, context);
      mix[decision.recommendation] += 1;

      const owner = job.runId ? decisionsByRun.get(job.runId) : undefined;
      const outcome = job.runId ? outcomesByRun.get(job.runId) : undefined;
      const adjs = job.runId ? adjsByRun.get(job.runId) ?? [] : [];

      return {
        id: job.id,
        title: job.title,
        recommendation: decision.recommendation,
        quote: Math.round(live.evaluatedPrice),
        sendPrice: decision.suggestedPrice != null ? Math.round(decision.suggestedPrice) : null,
        floor: Math.round(live.minimumAcceptablePrice),
        confidence: Math.round(live.confidence * 100),
        firstReason: decision.reasons[0]?.text ?? '',
        lookFirst: decision.lookFirst ?? null,
        walkAwayPrice: decision.walkAwayPrice ?? null,
        truck: truckHeadline(decision.recommendation, Math.round(live.evaluatedPrice), decision.suggestedPrice, decision.lookFirst),
        truckLine: truckSentence(decision.recommendation, Math.round(live.evaluatedPrice), decision.suggestedPrice, decision.lookFirst, decision.walkAwayPrice),
        ownerAction: owner?.ownerAction ?? null,
        ownerQuoted: owner?.quotedPrice ?? outcome?.quotedPrice ?? null,
        rivetPriceThen: owner ? Math.round(owner.rivetPrice) : null,
        overrideNote: formatOverride(adjs, owner),
      };
    });

    return { scenario, context, mix, jobs: rows };
  });

  const byId = (id: WeekScenarioId) => scenarioResults.find(s => s.scenario.id === id);
  const monday = byId('monday');
  const midweek = byId('midweek');
  const friday = byId('friday');
  const recChanges: SimulationReport['recChanges'] = [];
  if (monday && midweek && friday) {
    for (const job of jobs) {
      const m = monday.jobs.find(j => j.id === job.id);
      const mid = midweek.jobs.find(j => j.id === job.id);
      const f = friday.jobs.find(j => j.id === job.id);
      if (!m || !mid || !f) continue;
      if (m.recommendation !== mid.recommendation || m.recommendation !== f.recommendation) {
        recChanges.push({
          id: job.id,
          title: job.title,
          monday: m.recommendation,
          midweek: mid.recommendation,
          friday: f.recommendation,
        });
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    budget,
    scenarios: scenarioResults,
    recChanges,
  };
}

export function renderSimulationMarkdown(report: SimulationReport): string {
  const lines: string[] = [];
  const ln = (s = '') => lines.push(s);
  const b = report.budget;

  ln('# Handyman week simulation');
  ln('');
  ln(`Generated: ${report.generatedAt}`);
  ln('');
  ln('Solo budget (Mason defaults unless you override `--goal` / `--hours`):');
  ln('');
  ln(`- Weekly earnings goal: $${b.weeklyGoal}`);
  ln(`- Weekly hours: ${b.weeklyHours}`);
  ln(`- Min job: $${b.minimumJobPrice} · min $/labor hour: $${b.minimumHourlyRate}`);
  ln('');
  ln('Run again after any engine change: `npm run sim`');
  ln('');

  for (const sc of report.scenarios) {
    ln(`## ${sc.scenario.label}`);
    ln('');
    const sendCount = sc.mix.take + sc.mix.take_at_price;
    ln(`Earned $${sc.context.weeklyEarningsToDate} · ${sc.context.remainingCapacityHours}h left`);
    ln('');
    ln(`| Send | Look first | Pass |`);
    ln(`| ---: | ---: | ---: |`);
    ln(`| ${sendCount} | ${sc.mix.review} | ${sc.mix.pass} |`);
    ln('');
    ln('| ID | Title | Truck | If they push | Owner sent | Feel? |');
    ln('| --- | --- | --- | ---: | ---: | --- |');
    for (const job of sc.jobs) {
      const owner = job.ownerQuoted != null ? `$${job.ownerQuoted}` : '—';
      const low = job.walkAwayPrice != null ? `$${job.walkAwayPrice}` : '—';
      ln(`| ${job.id} | ${job.title} | **${job.truck}** | ${low} | ${owner} | |`);
    }
    ln('');
  }

  ln('## Recs that flip across the week');
  ln('');
  if (report.recChanges.length === 0) {
    ln('No job changes recommendation between Monday, midweek, and Friday under this budget.');
  } else {
    ln('| ID | Title | Monday | Midweek | Friday |');
    ln('| --- | --- | --- | --- | --- |');
    const byScenario = (id: WeekScenarioId) => report.scenarios.find(s => s.scenario.id === id);
    const mondayJobs = byScenario('monday')?.jobs ?? [];
    const midweekJobs = byScenario('midweek')?.jobs ?? [];
    const fridayJobs = byScenario('friday')?.jobs ?? [];
    for (const row of report.recChanges) {
      const m = mondayJobs.find(j => j.id === row.id);
      const mid = midweekJobs.find(j => j.id === row.id);
      const f = fridayJobs.find(j => j.id === row.id);
      ln(`| ${row.id} | ${row.title} | ${m?.truck ?? row.monday} | ${mid?.truck ?? row.midweek} | ${f?.truck ?? row.friday} |`);
    }
  }
  ln('');
  return lines.join('\n');
}

function formatOverride(adjs: AdjustmentEntry[], owner?: OwnerDecision): string | null {
  const bits: string[] = [];
  if (owner?.ownerAction === 'approved_adjusted' && owner.quotedPrice != null) {
    bits.push(`owner sent $${Math.round(owner.quotedPrice)} vs Rivet $${Math.round(owner.rivetPrice)}`);
  } else if (owner?.ownerAction === 'approved') {
    bits.push('owner took Rivet price');
  } else if (owner?.ownerAction === 'declined') {
    bits.push('owner declined');
  }
  for (const adj of adjs) {
    bits.push(`${adj.field} ${adj.systemValue}→${adj.newValue}${adj.reasonText ? ` (${adj.reasonText})` : ''}`);
  }
  return bits.length ? bits.join('; ') : null;
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
