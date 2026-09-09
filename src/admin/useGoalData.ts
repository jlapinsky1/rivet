/**
 * Hook that computes goal progress metrics from work items and user settings.
 * Derives everything from the already-loaded work items context and localStorage settings.
 */

import { useMemo } from 'react';
import { useWorkItemsContext } from './WorkItemsContext';

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

function getWeekBounds(): { mondayStr: string; sundayStr: string; daysLeftInWeek: number } {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const daysLeftInWeek = Math.max(1, 7 - (day === 0 ? 7 : day));
  return {
    mondayStr: monday.toISOString().slice(0, 10),
    sundayStr: sunday.toISOString().slice(0, 10),
    daysLeftInWeek,
  };
}

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

    // Use same defaults as Settings UI (field('weeklyGoal', 2500), field('weeklyHours', 35))
    const weeklyGoal = (businessSettings?.weeklyGoal as number) ?? 2500;
    const weeklyHours = (businessSettings?.weeklyHours as number) || 35;
    const hasGoal = weeklyGoal > 0;

    const { daysLeftInWeek } = getWeekBounds();

    // Always compute from Supabase work items regardless of goal state
    const completed = workItems.filter(w => w.opStatus === 'completed');
    const earnedThisWeek = completed.reduce((sum, w) => sum + (w.profit || 0), 0);

    const scheduled = workItems.filter(w => w.opStatus === 'scheduled');
    const scheduledProfit = scheduled.reduce((sum, w) => sum + (w.profit || 0), 0);

    const totalEarned = earnedThisWeek + scheduledProfit;
    const hoursPerDay = weeklyHours / 5;
    const availableHours = Math.round(daysLeftInWeek * hoursPerDay);

    const progressPct = hasGoal ? Math.min(100, Math.round((totalEarned / weeklyGoal!) * 100)) : 0;
    const remaining = hasGoal ? Math.max(0, weeklyGoal! - totalEarned) : 0;
    const neededPerHour = hasGoal && availableHours > 0 ? Math.round(remaining / availableHours) : 0;
    const requiredDailyProfit = hasGoal && daysLeftInWeek > 0 ? Math.round(remaining / daysLeftInWeek) : 0;

    let paceStatus: string;
    if (progressPct >= 100) paceStatus = 'achieved';
    else if (progressPct >= 75) paceStatus = 'ahead';
    else if (progressPct >= 50) paceStatus = 'on_pace';
    else if (progressPct >= 25) paceStatus = 'at_risk';
    else paceStatus = 'behind';

    return {
      hasGoal,
      loading: false,
      earnedThisWeek: totalEarned,
      weeklyTarget: weeklyGoal ?? 0,
      progressPct,
      availableHours,
      scheduledJobs: scheduled.length,
      neededPerHour,
      paceStatus,
      paceLabel: PACE_LABELS[paceStatus] || 'ON PACE',
      jobsBooked: scheduled.length,
      requiredDailyProfit,
    };
  }, [workItems, loading, businessSettings]);
}
