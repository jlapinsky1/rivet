import type { DecisionContext } from './types';

export type WeekContextJob = {
  opStatus: string;
  profit?: number;
  hoursNum?: number;
  capacityHours?: number;
  countsTowardCurrentWeek?: boolean;
};

export type WeekContextSettings = {
  weeklyGoal?: number;
  weeklyHours?: number;
};

const COMMITTED_STATUSES = new Set([
  'completed',
  'scheduled',
  'in_progress',
  'approved',
]);

/**
 * Weekly earnings, remaining hours, and needed $/schedule hour.
 * Quoted / needs_review jobs are not treated as committed.
 */
export function buildDecisionContext(
  jobs: WeekContextJob[],
  settings: WeekContextSettings = {},
): DecisionContext {
  const weeklyGoal = Number(settings.weeklyGoal) || 2500;
  const weeklyHours = Number(settings.weeklyHours) || 35;

  let earned = 0;
  let committedHours = 0;

  for (const job of jobs) {
    if (job.countsTowardCurrentWeek === false) continue;
    if (!COMMITTED_STATUSES.has(job.opStatus)) continue;
    earned += Number(job.profit) || 0;
    const hours = job.capacityHours != null ? job.capacityHours : (Number(job.hoursNum) || 0);
    committedHours += hours;
  }

  const remainingCapacityHours = Math.max(0, round2(weeklyHours - committedHours));
  const gap = Math.max(0, weeklyGoal - earned);
  const requiredContributionPerCapacityHour = remainingCapacityHours > 0
    ? round2(gap / remainingCapacityHours)
    : 0;

  return {
    weeklyEarningsToDate: round2(earned),
    remainingCapacityHours,
    pipelineValue: 0,
    pipelineHours: 0,
    requiredContributionPerCapacityHour,
  };
}

export function parseTravelMiles(travel: string | undefined | null): number {
  if (!travel) return 10;
  const match = String(travel).match(/([\d.]+)/);
  return match ? Number(match[1]) : 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
