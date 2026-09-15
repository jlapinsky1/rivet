import { calculateActuals } from './completion.js';
import { DEFAULT_PIPELINE_WEIGHTS } from './goalDefaults.js';

/**
 * Count working days between two dates (inclusive) given an array of
 * ISO day-of-week numbers (0=Sun, 1=Mon, … 6=Sat).
 */
export function getWorkingDays(startDate, endDate, daysOfWeek = [1, 2, 3, 4, 5]) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  if (end < start) return 0;

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    if (daysOfWeek.includes(cursor.getDay())) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

/**
 * Extract realized profit from a completed booking based on goal type.
 * Returns null if actuals are missing or incomplete (missing data ≠ zero).
 */
export function extractProfit(booking, goalType) {
  const actuals = booking.actuals;
  if (!actuals || actuals.finalAmount == null || actuals.finalAmount === '') return null;

  const computed = calculateActuals(actuals, null);

  if (goalType === 'revenue') return computed.finalAmount;
  if (goalType === 'owner_adjusted_profit') return computed.ownerAdjustedProfit;
  return computed.cashProfit; // cash_profit default
}

/**
 * Extract expected profit from a non-completed booking.
 * Uses approved_quote and internal_estimate.
 */
export function extractExpectedProfit(booking, goalType) {
  if (goalType === 'revenue') {
    return Number(booking.approved_quote) || 0;
  }

  const estimate = booking.internal_estimate;
  if (!estimate) {
    // Fallback: use approved_quote as revenue proxy
    return Number(booking.approved_quote) || 0;
  }

  const revenue = Number(booking.approved_quote) || estimate.recommendedPrice || 0;
  const directCosts = (estimate.disposalAllowance || 0)
    + (estimate.estimatedFuelCost || 0)
    + (estimate.laborAllowance || 0);

  if (goalType === 'owner_adjusted_profit') {
    const ownerLabor = estimate.ownerLaborCost || 0;
    return revenue - directCosts - ownerLabor;
  }

  return revenue - directCosts; // cash_profit
}

/**
 * Calculate the committed projection: completed (100%) + scheduled (100%).
 * Completed bookings with missing actuals are excluded.
 */
export function calculateCommittedProjection(completedBookings, scheduledBookings, goalType) {
  let total = 0;
  for (const b of completedBookings) {
    const profit = extractProfit(b, goalType);
    if (profit !== null) total += profit;
  }
  for (const b of scheduledBookings) {
    total += extractExpectedProfit(b, goalType);
  }
  return total;
}

/**
 * Calculate weighted pipeline profit (pending_review, quote_sent only).
 * Scheduled bookings are NOT weighted - they are at 100% in committed projection.
 */
export function calculatePipelineProfit(pipelineBookings, weights, goalType) {
  const w = weights || DEFAULT_PIPELINE_WEIGHTS;
  let total = 0;
  for (const b of pipelineBookings) {
    const expected = extractExpectedProfit(b, goalType);
    const weight = w[b.status] ?? 0;
    total += expected * weight;
  }
  return total;
}

/**
 * Determine pace status from percentage achieved vs percentage of time elapsed.
 */
export function determinePaceStatus(pctAchieved, pctTimeElapsed) {
  if (pctAchieved >= 100) return 'achieved';
  if (pctTimeElapsed === 0) return 'on_pace';
  const ratio = pctAchieved / pctTimeElapsed;
  if (ratio >= 1.10) return 'ahead';
  if (ratio >= 0.90) return 'on_pace';
  if (ratio >= 0.70) return 'at_risk';
  return 'behind';
}

/**
 * Main goal progress calculation.
 *
 * @param {Object} goal - business_goals row
 * @param {Array} completedBookings - bookings with status='completed' in goal date range
 * @param {Array} scheduledBookings - bookings with status='scheduled'
 * @param {Array} pipelineBookings - bookings with status in ('pending_review','quote_sent')
 * @returns {Object} GoalProgress
 */
export function calculateGoalProgress(goal, completedBookings, scheduledBookings, pipelineBookings) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(goal.start_date);
  const endDate = new Date(goal.end_date);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(0, 0, 0, 0);
  const daysConfig = goal.working_days_config?.days || [1, 2, 3, 4, 5];

  const workingDaysTotal = getWorkingDays(startDate, endDate, daysConfig);
  const effectiveToday = today > endDate ? endDate : today;
  const workingDaysElapsed = getWorkingDays(startDate, effectiveToday, daysConfig);
  const workingDaysRemaining = Math.max(0, workingDaysTotal - workingDaysElapsed);

  // Completed profit (exclude bookings with missing actuals)
  let completedProfit = 0;
  let jobsCompleted = 0;
  let jobsMissingActuals = 0;
  for (const b of completedBookings) {
    const profit = extractProfit(b, goal.goal_type);
    if (profit !== null) {
      completedProfit += profit;
      jobsCompleted++;
    } else {
      jobsMissingActuals++;
    }
  }

  // Scheduled expected profit (100% weight - committed)
  let bookedProfit = 0;
  for (const b of scheduledBookings) {
    bookedProfit += extractExpectedProfit(b, goal.goal_type);
  }

  // Pipeline weighted profit (pending_review, quote_sent)
  const weights = goal.pipeline_weights || DEFAULT_PIPELINE_WEIGHTS;
  const pipelineProfit = calculatePipelineProfit(pipelineBookings, weights, goal.goal_type);

  // Projections
  const committedProjection = completedProfit + bookedProfit;
  const weightedProjection = committedProjection + pipelineProfit;
  const remaining = Math.max(0, goal.target_amount - weightedProjection);
  const pctAchieved = goal.target_amount > 0
    ? (weightedProjection / goal.target_amount) * 100
    : 0;
  const pctTimeElapsed = workingDaysTotal > 0
    ? (workingDaysElapsed / workingDaysTotal) * 100
    : 0;

  const avgDailyProfit = workingDaysElapsed > 0
    ? completedProfit / workingDaysElapsed
    : 0;
  const requiredDailyProfit = workingDaysRemaining > 0
    ? remaining / workingDaysRemaining
    : 0;
  const projectedEOP = workingDaysElapsed > 0
    ? avgDailyProfit * workingDaysTotal
    : 0;

  const paceStatus = determinePaceStatus(pctAchieved, pctTimeElapsed);
  const paceVariance = requiredDailyProfit > 0
    ? (avgDailyProfit - requiredDailyProfit) / requiredDailyProfit
    : avgDailyProfit > 0 ? 1 : 0;

  // Stretch progress (profit above target when achieved)
  const stretchAmount = weightedProjection > goal.target_amount
    ? weightedProjection - goal.target_amount
    : 0;

  return {
    completedProfit: round2(completedProfit),
    bookedProfit: round2(bookedProfit),
    pipelineProfit: round2(pipelineProfit),
    committedProjection: round2(committedProjection),
    weightedProjection: round2(weightedProjection),
    remaining: round2(remaining),
    pctAchieved: round1(pctAchieved),
    pctTimeElapsed: round1(pctTimeElapsed),
    workingDaysElapsed,
    workingDaysRemaining,
    workingDaysTotal,
    avgDailyProfit: round2(avgDailyProfit),
    requiredDailyProfit: round2(requiredDailyProfit),
    projectedEOP: round2(projectedEOP),
    paceStatus,
    paceVariance: round2(paceVariance),
    jobsCompleted,
    jobsMissingActuals,
    avgProfitPerJob: jobsCompleted > 0 ? round2(completedProfit / jobsCompleted) : 0,
    stretchAmount: round2(stretchAmount),
  };
}

/**
 * Today's progress relative to the goal.
 */
export function getTodayProgress(goal, todayBookings, progress) {
  const profitNeededToday = progress.requiredDailyProfit;
  let bookedProfitToday = 0;
  let completedProfitToday = 0;
  let capacityBooked = 0;
  let estimatedHours = 0;
  let estimatedTravelMinutes = 0;

  for (const b of todayBookings) {
    if (b.status === 'completed') {
      const p = extractProfit(b, goal.goal_type);
      if (p !== null) completedProfitToday += p;
    } else if (b.status === 'scheduled') {
      bookedProfitToday += extractExpectedProfit(b, goal.goal_type);
      capacityBooked++;
      const est = b.internal_estimate;
      if (est) {
        estimatedHours += est.estimatedOnSiteHours || 0;
        estimatedTravelMinutes += est.estimatedTravelMinutes || 0;
      }
    }
  }

  return {
    profitNeededToday: round2(profitNeededToday),
    completedProfitToday: round2(completedProfitToday),
    bookedProfitToday: round2(bookedProfitToday),
    remainingDaily: round2(Math.max(0, profitNeededToday - completedProfitToday - bookedProfitToday)),
    capacityBooked,
    capacityLimit: goal.daily_capacity_limit || 4,
    estimatedHours: round1(estimatedHours),
    estimatedTravelMinutes: Math.round(estimatedTravelMinutes),
  };
}

/**
 * This week's progress.
 */
export function getWeekProgress(goal, weekBookings, progress) {
  const weeklyTarget = goal.weekly_target
    || (progress.requiredDailyProfit * Math.min(5, progress.workingDaysRemaining));
  let completedThisWeek = 0;
  let bookedThisWeek = 0;

  for (const b of weekBookings) {
    if (b.status === 'completed') {
      const p = extractProfit(b, goal.goal_type);
      if (p !== null) completedThisWeek += p;
    } else if (b.status === 'scheduled') {
      bookedThisWeek += extractExpectedProfit(b, goal.goal_type);
    }
  }

  return {
    weeklyTarget: round2(weeklyTarget),
    completedThisWeek: round2(completedThisWeek),
    bookedThisWeek: round2(bookedThisWeek),
    remainingWeekly: round2(Math.max(0, weeklyTarget - completedThisWeek - bookedThisWeek)),
  };
}

/**
 * Generate alerts based on goal progress.
 */
export function generateAlerts(progress, goal) {
  const alerts = [];

  if (progress.paceStatus === 'achieved') {
    alerts.push({
      type: 'goal_achieved',
      severity: 'success',
      message: `Monthly target of $${fmt(goal.target_amount)} achieved! $${fmt(progress.stretchAmount)} above target.`,
    });
  } else if (progress.paceStatus === 'ahead') {
    alerts.push({
      type: 'ahead_of_pace',
      severity: 'success',
      message: `Ahead of pace - projected to finish at $${fmt(progress.projectedEOP)}.`,
    });
  } else if (progress.paceStatus === 'behind') {
    const deficit = progress.remaining;
    alerts.push({
      type: 'behind_pace',
      severity: 'warning',
      message: `Behind pace by $${fmt(deficit)}. Need $${fmt(progress.requiredDailyProfit)}/day over ${progress.workingDaysRemaining} remaining working days.`,
    });
  } else if (progress.paceStatus === 'at_risk') {
    alerts.push({
      type: 'at_risk',
      severity: 'info',
      message: `At risk - current daily average ($${fmt(progress.avgDailyProfit)}) is below the required pace ($${fmt(progress.requiredDailyProfit)}).`,
    });
  }

  if (progress.jobsMissingActuals > 0) {
    alerts.push({
      type: 'missing_actuals',
      severity: 'warning',
      message: `${progress.jobsMissingActuals} completed job(s) missing actuals - not included in profit calculations.`,
    });
  }

  if (progress.jobsCompleted > 0 && progress.avgProfitPerJob < (goal.minimum_job_profit || 75)) {
    alerts.push({
      type: 'low_avg_profit',
      severity: 'warning',
      message: `Average profit per job ($${fmt(progress.avgProfitPerJob)}) is below minimum target ($${fmt(goal.minimum_job_profit || 75)}).`,
    });
  }

  if (progress.paceStatus !== 'achieved' && progress.committedProjection >= goal.target_amount) {
    alerts.push({
      type: 'committed_sufficient',
      severity: 'success',
      message: `Booked and completed work is sufficient to hit the monthly target.`,
    });
  }

  return alerts;
}

/**
 * Calculate dynamic profit targets based on current goal progress and today's schedule.
 *
 * These are advisory targets - "what profit should the next job contribute given
 * where we stand?" - not hard guardrails.
 *
 * @param {Object} goalProgress - from calculateGoalProgress()
 * @param {Object} todayProgress - from getTodayProgress()
 * @param {Object} goal - active business_goals row
 * @returns {Object} DynamicTargets
 */
export function calculateDynamicTargets(goalProgress, todayProgress, goal) {
  const remainingDailyProfit = todayProgress?.remainingDaily ?? goalProgress.requiredDailyProfit;
  const capacityLimit = todayProgress?.capacityLimit ?? (goal.daily_capacity_limit || 4);
  const capacityBooked = todayProgress?.capacityBooked ?? 0;
  const openSlots = Math.max(0, capacityLimit - capacityBooked);

  // Suggested profit per remaining slot
  const suggestedPerSlot = openSlots > 0
    ? round2(remainingDailyProfit / openSlots)
    : round2(remainingDailyProfit);

  // How urgently do we need profit? (0 = relaxed, 1 = critical)
  let urgency = 0;
  if (goalProgress.paceStatus === 'behind') urgency = 0.9;
  else if (goalProgress.paceStatus === 'at_risk') urgency = 0.6;
  else if (goalProgress.paceStatus === 'on_pace') urgency = 0.3;
  else if (goalProgress.paceStatus === 'ahead') urgency = 0.1;
  else if (goalProgress.paceStatus === 'achieved') urgency = 0;

  // Capacity scarcity: how precious are remaining slots? (0 = plenty, 1 = last slot)
  const capacityScarcity = capacityLimit > 0
    ? round2(capacityBooked / capacityLimit)
    : 0;

  // Is today's remaining target already covered by booked work?
  const todayCovered = remainingDailyProfit <= 0;

  return {
    remainingDailyProfit: round2(remainingDailyProfit),
    openSlots,
    capacityLimit,
    capacityBooked,
    suggestedPerSlot,
    urgency,
    capacityScarcity,
    todayCovered,
    paceStatus: goalProgress.paceStatus,
    workingDaysRemaining: goalProgress.workingDaysRemaining,
    periodRemaining: round2(goalProgress.remaining),
  };
}

function round2(n) { return Math.round(n * 100) / 100; }
function round1(n) { return Math.round(n * 10) / 10; }
function fmt(n) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
