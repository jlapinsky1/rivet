import { DECISION_RULES } from './decisionRules.js';

/**
 * Evaluate a quote/booking against all decision rules and produce
 * a Take / Review / Pass recommendation with a human-readable explanation.
 *
 * @param {Object} context
 * @param {Object} context.estimate      - from buildEstimate()
 * @param {Object} context.confidence    - from calculateConfidence()
 * @param {Object} context.jobRating     - from rateJob()
 * @param {Array}  context.riskFlags     - from detectRiskFlags()
 * @param {Object} context.blockerOverrides - admin-overridden blockers
 * @param {Object|null} context.goalProgress  - from calculateGoalProgress()
 * @param {Object|null} context.goal          - active business_goals row
 * @param {Object|null} context.scheduleContext - { jobsToday, capacityLimit, nearbyJobs }
 * @param {Object|null} context.dynamicTargets  - from calculateDynamicTargets()
 * @returns {Decision}
 */
export function evaluateDecision(context) {
  const ruleResults = [];
  let hardFail = false;
  let hasGateReview = false;
  let compositeScore = 0.50; // neutral baseline

  for (const rule of DECISION_RULES) {
    const raw = rule.evaluate(context);
    const result = {
      ruleId: rule.id,
      ruleName: rule.name,
      type: rule.type,
      weight: rule.weight || 0,
      ...raw,
    };
    ruleResults.push(result);

    if (rule.type === 'hard' && result.result === 'fail') {
      hardFail = true;
    }

    if (rule.type === 'gate' && result.result === 'review') {
      hasGateReview = true;
    }

    if (rule.type === 'soft' && result.result !== 'skip') {
      const bonus = result.data?.bonus || 0;
      compositeScore += bonus;
    }
  }

  compositeScore = Math.max(0, Math.min(1, compositeScore));
  const score = Math.round(compositeScore * 100);

  // Determine recommendation
  let recommendation;
  let headline;

  if (hardFail) {
    recommendation = 'pass';
    const failedHard = ruleResults.filter(r => r.type === 'hard' && r.result === 'fail');
    headline = failedHard.map(r => r.message).join('; ');
  } else if (hasGateReview) {
    recommendation = 'review';
    const gateIssues = ruleResults.filter(r => r.type === 'gate' && r.result === 'review');
    headline = gateIssues.map(r => r.message).join('; ');
  } else if (score >= 65) {
    recommendation = 'take';
    headline = 'Strong job - fits goals and schedule';
  } else if (score >= 40) {
    recommendation = 'review';
    headline = 'Review carefully - mixed signals';
  } else {
    recommendation = 'pass';
    headline = 'Weak job - consider passing unless schedule is light';
  }

  // Contextual headline adjustments
  if (context.goalProgress?.paceStatus === 'behind' && recommendation === 'review' && !hardFail) {
    headline = 'Behind pace - review carefully, consider taking if profitable';
  }

  // Collect reasons by category
  const blockers = ruleResults
    .filter(r => r.result === 'fail')
    .map(r => r.message);
  const negativeFactors = ruleResults
    .filter(r => r.result === 'review' || (r.data?.bonus < 0 && r.result !== 'skip'))
    .map(r => r.message);
  const positiveFactors = ruleResults
    .filter(r => r.result === 'pass' && r.data?.bonus > 0)
    .map(r => r.message);
  const reasons = [...blockers, ...negativeFactors, ...positiveFactors].slice(0, 6);

  // Goal contribution
  let goalContribution = null;
  if (context.goalProgress && context.estimate) {
    const daily = context.goalProgress.requiredDailyProfit;
    const weekly = daily * 5;
    const profit = context.estimate.estimatedProfit || 0;
    goalContribution = {
      dailyPct: daily > 0 ? Math.round((profit / daily) * 100) : null,
      weeklyPct: weekly > 0 ? Math.round((profit / weekly) * 100) : null,
    };
  }

  // Suggested minimum acceptable price
  let suggestedMinPrice = null;
  let priceForTargetMargin = null;
  if (context.estimate) {
    const est = context.estimate;
    const directCosts = (est.disposalAllowance || 0)
      + (est.estimatedFuelCost || 0)
      + (est.laborAllowance || 0);
    const minMargin = context.goal?.minimum_margin ?? 0.55;
    if (minMargin < 1) {
      priceForTargetMargin = Math.round(directCosts / (1 - minMargin));
    }
    const minProfit = context.goal?.minimum_job_profit ?? 75;
    suggestedMinPrice = Math.max(
      directCosts + minProfit,
      priceForTargetMargin || 0
    );
    suggestedMinPrice = Math.ceil(suggestedMinPrice / 5) * 5;
    if (priceForTargetMargin) priceForTargetMargin = Math.ceil(priceForTargetMargin / 5) * 5;
  }

  // Build human-readable explanation
  const explanation = buildExplanation(
    recommendation, context, ruleResults, goalContribution
  );

  return {
    recommendation,
    score,
    headline,
    explanation,
    reasons,
    positiveFactors,
    negativeFactors,
    blockers,
    goalContribution,
    suggestedMinPrice,
    priceForTargetMargin,
    confidence: context.confidence?.score ?? null,
    ruleResults,
    goalContext: context.goalProgress ? {
      paceStatus: context.goalProgress.paceStatus,
      pctAchieved: context.goalProgress.pctAchieved,
      requiredDailyProfit: context.goalProgress.requiredDailyProfit,
    } : null,
    dynamicTargets: context.dynamicTargets || null,
    scheduleContext: context.scheduleContext || null,
    evaluatedAt: new Date().toISOString(),
  };
}

/**
 * Build a human-readable explanation paragraph for why a recommendation was made.
 */
function buildExplanation(recommendation, context, ruleResults, goalContribution) {
  const profit = context.estimate?.estimatedProfit;
  const margin = context.estimate?.estimatedMargin;
  const dt = context.dynamicTargets;
  const goal = context.goal;
  const gp = context.goalProgress;

  const parts = [];

  // Opening: state the profit
  if (profit != null) {
    parts.push(`Expected owner-adjusted profit is $${Math.round(profit)} (${margin != null ? (margin * 100).toFixed(0) + '% margin' : 'margin unknown'}).`);
  }

  // Hard fail explanation
  const hardFails = ruleResults.filter(r => r.type === 'hard' && r.result === 'fail');
  if (hardFails.length > 0) {
    parts.push(hardFails.map(r => r.message).join('. ') + '.');
    return parts.join(' ');
  }

  // Safety floor context
  const minProfit = goal?.minimum_job_profit ?? 75;
  const minMargin = goal?.minimum_margin ?? 0.55;
  if (profit != null && profit >= minProfit && margin != null && margin >= minMargin) {
    parts.push(`This is above your safety floors ($${minProfit} profit, ${(minMargin * 100).toFixed(0)}% margin).`);
  } else if (profit != null && profit < minProfit) {
    parts.push(`This is below your $${minProfit} absolute profit floor.`);
  } else if (margin != null && margin < minMargin) {
    parts.push(`Margin is below your ${(minMargin * 100).toFixed(0)}% absolute margin floor.`);
  }

  // Dynamic targets context
  if (dt) {
    if (dt.todayCovered) {
      parts.push("Today's profit target is already covered by booked work.");
    } else if (dt.openSlots > 0 && dt.suggestedPerSlot > 0) {
      const slotWord = dt.openSlots === 1 ? 'slot' : 'slots';
      parts.push(`Today has ${dt.openSlots} remaining schedule ${slotWord} and you need roughly $${Math.round(dt.suggestedPerSlot)} profit per remaining job to hit today's target (this is not a suggested quote price).`);

      if (profit != null) {
        if (profit >= dt.suggestedPerSlot) {
          parts.push('This job meets or exceeds that target.');
        } else if (profit >= dt.suggestedPerSlot * 0.70) {
          parts.push('This job is close to the suggested slot target.');
        } else {
          parts.push('This job is below the suggested slot target.');
        }
      }
    }

    // Capacity scarcity
    if (dt.openSlots === 1 && !dt.todayCovered) {
      parts.push('This is the last open slot today - consider whether a stronger job might fill it.');
    } else if (dt.openSlots === 0) {
      parts.push('Schedule is at capacity. Taking this job would exceed the daily limit.');
    }
  }

  // Pace context
  if (gp) {
    if (gp.paceStatus === 'behind') {
      parts.push('You are behind pace - profitable work helps close the gap.');
    } else if (gp.paceStatus === 'at_risk') {
      parts.push('You are at risk of falling behind - prioritize strong jobs.');
    } else if (gp.paceStatus === 'ahead' || gp.paceStatus === 'achieved') {
      parts.push('You are ahead of pace - you can afford to be selective.');
    }
  }

  // Goal contribution
  if (goalContribution?.dailyPct != null && goalContribution.dailyPct > 0) {
    parts.push(`This job covers ${goalContribution.dailyPct}% of your daily target.`);
  }

  // Suggestion based on recommendation
  if (recommendation === 'review' && dt && !dt.todayCovered && dt.openSlots > 0) {
    parts.push('Consider scheduling this on another day or batching it with nearby work.');
  }

  return parts.join(' ');
}

export const DECISION_COLORS = {
  take: 'bg-green-50 border-green-400 text-green-800',
  review: 'bg-amber-50 border-amber-400 text-amber-800',
  pass: 'bg-red-50 border-red-400 text-red-800',
};

export const DECISION_LABELS = {
  take: 'Take',
  review: 'Review',
  pass: 'Pass',
};
