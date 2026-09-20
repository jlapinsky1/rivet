import type { DecisionContext } from './types';

export type WeekContextJob = {
  opStatus: string;
  profit?: number;
  hoursNum?: number;
  capacityHours?: number;
  countsTowardCurrentWeek?: boolean;
  /** When the work item was created (ISO). */
  createdAt?: string;
  /** When the job was finished (ISO). Preferred over createdAt for completed work. */
  completedAt?: string;
};

export type WeekContextSettings = {
  weeklyGoal?: number;
  weeklyHours?: number;
  /** Clock for "this week". Defaults to now. Tests should pass a fixed date. */
  now?: Date;
};

const COMMITTED_STATUSES = new Set([
  'completed',
  'scheduled',
  'in_progress',
  'approved',
]);

/** Monday 00:00 local through Sunday. */
export function startOfLocalWeek(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function isInLocalWeek(iso: string | undefined, now: Date): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  const start = startOfLocalWeek(now).getTime();
  const end = start + 7 * 24 * 60 * 60 * 1000;
  return t >= start && t < end;
}

/**
 * Weekly earnings, remaining hours, and needed $/schedule hour.
 * Quoted / needs_review are not committed.
 * Completed jobs only count when completedAt/createdAt falls in this week.
 * Scheduled / in-progress / approved always count — they are on the board now.
 */
export function buildDecisionContext(
  jobs: WeekContextJob[],
  settings: WeekContextSettings = {},
): DecisionContext {
  const weeklyGoal = Number(settings.weeklyGoal) || 2500;
  const weeklyHours = Number(settings.weeklyHours) || 35;
  const now = settings.now ?? new Date();

  let earned = 0;
  let committedHours = 0;

  for (const job of jobs) {
    if (job.countsTowardCurrentWeek === false) continue;
    if (!COMMITTED_STATUSES.has(job.opStatus)) continue;

    if (job.opStatus === 'completed') {
      const when = job.completedAt ?? job.createdAt;
      if (when && !isInLocalWeek(when, now)) continue;
    }

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
