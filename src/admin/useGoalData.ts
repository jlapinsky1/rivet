/**
 * Hook that computes goal progress metrics from work items and user settings.
 */

import { useMemo } from 'react';
import { useWorkItemsContext } from './WorkItemsContext';
import { buildDecisionContext } from '../estimator/weekContext';

type GoalData = {
  hasGoal: boolean;
  loading: boolean;
  earnedThisWeek: number;
  weeklyTarget: number;
  progressPct: number;
  availableHours: number;
  scheduledJobs: number;
  neededPerHour: number;
  paceStatus: string;
  paceLabel: string;
  jobsBooked: number;
  requiredDailyProfit: number;
};

const PACE_LABELS: Record<string, string> = {
  achieved: 'ACHIEVED',
  ahead: 'AHEAD',
  on_pace: 'ON PACE',
  at_risk: 'AT RISK',
  behind: 'BEHIND',
};

export function useGoalData(businessSettings?: Record<string, any>): GoalData {
  const { workItems, loading } = useWorkItemsContext();

  return useMemo(() => {
    if (loading) {
      return {
        hasGoal: false, loading: true,
        earnedThisWeek: 0, weeklyTarget: 0, progressPct: 0,
        availableHours: 0, scheduledJobs: 0, neededPerHour: 0,
        paceStatus: 'on_pace', paceLabel: 'ON PACE',
        jobsBooked: 0, requiredDailyProfit: 0,
      };
    }

    const weeklyGoal = (businessSettings?.weeklyGoal as number) ?? 2500;
    const weeklyHours = (businessSettings?.weeklyHours as number) || 35;
    const hasGoal = weeklyGoal > 0;

    const ctx = buildDecisionContext(workItems, { weeklyGoal, weeklyHours });
    const scheduled = workItems.filter(w => w.opStatus === 'scheduled');
    const progressPct = hasGoal ? Math.min(100, Math.round((ctx.weeklyEarningsToDate / weeklyGoal) * 100)) : 0;
    const remaining = hasGoal ? Math.max(0, weeklyGoal - ctx.weeklyEarningsToDate) : 0;

    let paceStatus: string;
    if (progressPct >= 100) paceStatus = 'achieved';
    else if (ctx.remainingCapacityHours <= 0) paceStatus = remaining > 0 ? 'behind' : 'achieved';
    else if (progressPct >= 75) paceStatus = 'ahead';
    else if (progressPct >= 50) paceStatus = 'on_pace';
    else if (progressPct >= 25) paceStatus = 'at_risk';
    else paceStatus = 'behind';

    return {
      hasGoal,
      loading: false,
      earnedThisWeek: ctx.weeklyEarningsToDate,
      weeklyTarget: weeklyGoal,
      progressPct,
      availableHours: Math.round(ctx.remainingCapacityHours),
      scheduledJobs: scheduled.length,
      neededPerHour: Math.round(ctx.requiredContributionPerCapacityHour),
      paceStatus,
      paceLabel: PACE_LABELS[paceStatus] || 'ON PACE',
      jobsBooked: scheduled.length,
      requiredDailyProfit: remaining > 0 ? Math.round(remaining / 5) : 0,
    };
  }, [workItems, loading, businessSettings]);
}
