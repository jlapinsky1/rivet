/**
 * Hook that fetches the active business goal and computes progress metrics
 * for the HomeScreen summary grid and goal card.
 */

import { useState, useEffect } from 'react';
import { getRepo } from '../utils/repository';

type GoalData = {
  hasGoal: boolean;
  loading: boolean;
  // Summary metrics
  earnedThisWeek: number;
  weeklyTarget: number;
  progressPct: number;
  availableHours: number;
  scheduledJobs: number;
  neededPerHour: number;
  // Goal card
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

export function useGoalData(): GoalData {
  const [data, setData] = useState<GoalData>({
    hasGoal: false,
    loading: true,
    earnedThisWeek: 0,
    weeklyTarget: 0,
    progressPct: 0,
    availableHours: 0,
    scheduledJobs: 0,
    neededPerHour: 0,
    paceStatus: 'on_pace',
    paceLabel: 'ON PACE',
    jobsBooked: 0,
    requiredDailyProfit: 0,
  });

  useEffect(() => {
    (async () => {
      try {
        const repo = await getRepo();
        const goal = await repo.getActiveGoal('cash_profit');
        if (!goal) {
          setData(d => ({ ...d, loading: false, hasGoal: false }));
          return;
        }

        const { calculateGoalProgress, getWeekProgress, getTodayProgress, calculateDynamicTargets } = await import('../utils/goalEngine');

        const [completed, scheduled, pipeline] = await Promise.all([
          repo.getCompletedBookingsInRange(goal.start_date, goal.end_date),
          repo.getActiveBookingsByStatus(['scheduled']),
          repo.getActiveBookingsByStatus(['pending_review', 'quote_sent']),
        ]);

        const progress = calculateGoalProgress(goal, completed, scheduled, pipeline);

        // This week's progress
        const now = new Date();
        const dayOfWeek = now.getDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(now);
        monday.setDate(now.getDate() + mondayOffset);
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        const mondayStr = monday.toISOString().slice(0, 10);
        const sundayStr = sunday.toISOString().slice(0, 10);

        const weekCompleted = completed.filter((b: any) =>
          b.completedAt && b.completedAt.slice(0, 10) >= mondayStr && b.completedAt.slice(0, 10) <= sundayStr
        );

        let weekScheduled: any[] = [];
        try {
          const weekSlots = await repo.getScheduledBookingsForDateRange(mondayStr, sundayStr);
          weekScheduled = weekSlots
            .filter((s: any) => s.bookings)
            .map((s: any) => ({ ...s.bookings, status: 'scheduled' }));
        } catch { /* table may not exist */ }

        const week = getWeekProgress(goal, [...weekCompleted, ...weekScheduled], progress);

        // Calculate available hours from remaining capacity
        const workingDaysLeft = progress.workingDaysRemaining || 0;
        const hoursPerDay = goal.daily_capacity_limit ? goal.daily_capacity_limit * 3 : 8;
        const availableHours = workingDaysLeft * hoursPerDay;
        const remainingProfit = Math.max(0, week.remainingWeekly || 0);
        const neededPerHour = availableHours > 0 ? Math.round(remainingProfit / availableHours) : 0;

        const weeklyTotal = (week.completedThisWeek || 0) + (week.bookedThisWeek || 0);
        const pctOfGoal = week.weeklyTarget > 0 ? Math.round((weeklyTotal / week.weeklyTarget) * 100) : 0;

        setData({
          hasGoal: true,
          loading: false,
          earnedThisWeek: weeklyTotal,
          weeklyTarget: week.weeklyTarget || goal.target_amount || 0,
          progressPct: Math.min(100, pctOfGoal),
          availableHours,
          scheduledJobs: weekScheduled.length,
          neededPerHour,
          paceStatus: progress.paceStatus || 'on_pace',
          paceLabel: PACE_LABELS[progress.paceStatus] || 'ON PACE',
          jobsBooked: scheduled.length,
          requiredDailyProfit: progress.requiredDailyProfit || 0,
        });
      } catch (err) {
        console.error('Failed to load goal data:', err);
        setData(d => ({ ...d, loading: false, hasGoal: false }));
      }
    })();
  }, []);

  return data;
}
