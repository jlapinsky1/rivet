import type {
  EconomicJob,
  BusinessEconomicsConfig,
  DecisionContext,
  Recommendation,
  ReasonItem,
} from './types';

export type DecisionResult = {
  recommendation: Recommendation;
  reasons: ReasonItem[];
};

export function deriveRecommendation(
  job: EconomicJob,
  config: BusinessEconomicsConfig,
  context: DecisionContext,
): DecisionResult {
  const reasons: ReasonItem[] = [];
  let forceReview = false;
  let forcePass = false;

  // ─── Static Threshold Checks ───

  // Contribution profit vs absolute floor
  if (job.contributionProfit.expected < config.profitFloorAbsolute) {
    reasons.push({ icon: 'x', text: `Estimated profit $${Math.round(job.contributionProfit.expected)} is below minimum $${config.profitFloorAbsolute}` });
    forcePass = true;
  } else {
    reasons.push({ icon: 'check', text: `Estimated profit $${Math.round(job.contributionProfit.expected)} meets minimum` });
  }

  // Owner-adjusted rate vs minimum hourly rate
  if (job.ownerAdjustedPerHour.expected < config.minimumHourlyRate) {
    reasons.push({ icon: 'x', text: `Effective rate $${Math.round(job.ownerAdjustedPerHour.expected)}/hr is below minimum $${config.minimumHourlyRate}/hr` });
    forcePass = true;
  } else {
    reasons.push({ icon: 'check', text: `Effective rate $${Math.round(job.ownerAdjustedPerHour.expected)}/hr meets target` });
  }

  // Contribution margin vs floor
  if (job.contributionMargin.expected < config.marginFloorPercent / 100) {
    reasons.push({ icon: 'x', text: `Margin ${Math.round(job.contributionMargin.expected * 100)}% is below ${config.marginFloorPercent}% floor` });
    forcePass = true;
  } else {
    reasons.push({ icon: 'check', text: `Margin ${Math.round(job.contributionMargin.expected * 100)}% meets target` });
  }

  // ─── Confidence Check ───

  if (job.confidence < config.confidenceThreshold) {
    reasons.push({ icon: 'caution', text: `Estimate confidence ${Math.round(job.confidence * 100)}% is below ${Math.round(config.confidenceThreshold * 100)}% threshold — needs review` });
    forceReview = true;
  }

  // ─── High/Conservative Case Check ───

  if (!forcePass) {
    // Check if the high (worst) case breaks thresholds
    const highCaseProfit = job.contributionProfit.low; // low profit = worst case
    const highCaseRate = job.ownerAdjustedPerHour.low;

    if (highCaseProfit < config.profitFloorAbsolute || highCaseRate < config.minimumHourlyRate) {
      reasons.push({ icon: 'caution', text: 'Conservative estimate may fall below profit thresholds' });
      forceReview = true;
    }
  }

  // ─── Risk Flags ───

  if (job.riskFlags.includes('no_tasks_extracted')) {
    reasons.push({ icon: 'caution', text: 'Could not identify specific work tasks — requires manual review' });
    forceReview = true;
    forcePass = false;
  }

  if (job.riskFlags.includes('poor_component_coverage')) {
    reasons.push({ icon: 'caution', text: 'Many work components not recognized — estimate less reliable' });
    forceReview = true;
  }

  if (job.riskFlags.includes('unsupported_task_component')) {
    reasons.push({ icon: 'caution', text: 'Some work tasks not in Rivet\'s component library' });
    // Doesn't force review by itself — confidence drop in estimator handles it
  }

  // Legacy flags (backward compat)
  if (job.riskFlags.includes('unrecognized_job_class')) {
    reasons.push({ icon: 'caution', text: 'Job classification was not recognized — estimate less reliable' });
    forceReview = true;
  }

  if (job.riskFlags.includes('unknown_job_family')) {
    reasons.push({ icon: 'caution', text: 'Job type not recognized — requires manual review' });
    forceReview = true;
    forcePass = false;
  }

  for (const flag of job.riskFlags) {
    if (['no_tasks_extracted', 'poor_component_coverage', 'unsupported_task_component',
         'unrecognized_job_class', 'unknown_job_family', 'customer_supplied_compatibility'].includes(flag)) continue;
    if (flag.startsWith('structural_') || flag === 'hidden_water_damage' || flag === 'unknown_substrate') {
      reasons.push({ icon: 'caution', text: `Risk: ${flag.replace(/_/g, ' ')}` });
      forceReview = true;
    }
  }

  // ─── Dynamic Context Checks ───

  const hasContext = context.remainingCapacityHours > 0;

  if (hasContext) {
    // Capacity check
    if (job.capacityHours > context.remainingCapacityHours) {
      reasons.push({ icon: 'x', text: `Job needs ~${job.capacityHours.toFixed(1)}h but only ${context.remainingCapacityHours.toFixed(1)}h available this week` });
      forcePass = true;
    } else if (job.capacityHours > context.remainingCapacityHours * 0.5) {
      reasons.push({ icon: 'caution', text: `Job uses ${Math.round(job.capacityHours / context.remainingCapacityHours * 100)}% of remaining weekly capacity` });
    }

    // Required profit per hour check (goal pace)
    if (context.requiredProfitPerHour > 0 && job.ownerAdjustedPerHour.expected < context.requiredProfitPerHour) {
      reasons.push({ icon: 'caution', text: `At $${Math.round(job.ownerAdjustedPerHour.expected)}/hr, this is below the $${Math.round(context.requiredProfitPerHour)}/hr pace needed to hit your weekly goal` });
      if (!forcePass) forceReview = true;
    }

    // Goal pace — positive signal
    const projectedWeekly = context.weeklyEarningsToDate + job.contributionProfit.expected;
    if (projectedWeekly >= config.weeklyEarningsGoal && !forcePass) {
      reasons.push({ icon: 'check', text: 'This job puts you ahead of your weekly earnings goal' });
    }
  }

  // ─── Final Recommendation ───

  let recommendation: Recommendation;
  if (forcePass) {
    recommendation = 'pass';
  } else if (forceReview) {
    recommendation = 'review';
  } else {
    recommendation = 'take';
  }

  return { recommendation, reasons };
}
