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

// ─── Pricing Gap Bands ───
// Expressed as fraction of minimumAcceptablePrice.
// tiny:     gap <= 10% of min price → Review
// moderate: gap 10–25%              → Review (plenty of capacity) or Pass (scarce)
// large:    gap > 25%               → Pass
const GAP_BAND_TINY = 0.10;
const GAP_BAND_MODERATE = 0.25;
// Capacity scarcity threshold for moderate-gap escalation
const MODERATE_GAP_SCARCITY_RATIO = 0.30; // remaining / weekly total

export function deriveRecommendation(
  job: EconomicJob,
  config: BusinessEconomicsConfig,
  context: DecisionContext,
): DecisionResult {
  const reasons: ReasonItem[] = [];
  let forceReview = false;
  let forcePass = false;

  // ─── Pricing Gap Check (graduated) ───
  // Compare evaluatedPrice against minimumAcceptablePrice

  const pricingGap = job.minimumAcceptablePrice - job.evaluatedPrice;
  if (pricingGap > 0) {
    const gapPercent = job.minimumAcceptablePrice > 0
      ? pricingGap / job.minimumAcceptablePrice
      : 1;
    const capacityRatio = context.remainingCapacityHours > 0
      ? context.remainingCapacityHours / config.weeklyCapacityHours
      : 1; // no context → treat as plenty of capacity

    if (gapPercent <= GAP_BAND_TINY) {
      // Tiny gap — barely below minimum
      reasons.push({ icon: 'caution',
        text: `This looks like roughly a $${Math.round(job.evaluatedPrice)} job, just below the $${Math.round(job.minimumAcceptablePrice)} minimum — ${Math.round(gapPercent * 100)}% gap` });
      forceReview = true;
    } else if (gapPercent <= GAP_BAND_MODERATE) {
      // Moderate gap — depends on remaining capacity
      if (capacityRatio < MODERATE_GAP_SCARCITY_RATIO) {
        reasons.push({ icon: 'x',
          text: `This looks like roughly a $${Math.round(job.evaluatedPrice)} job, but it would need to be about $${Math.round(job.minimumAcceptablePrice)} to justify the schedule time — ${Math.round(gapPercent * 100)}% gap with scarce capacity` });
        forcePass = true;
      } else {
        reasons.push({ icon: 'caution',
          text: `This looks like roughly a $${Math.round(job.evaluatedPrice)} job, but it would need to be about $${Math.round(job.minimumAcceptablePrice)} to stay on pace — ${Math.round(gapPercent * 100)}% gap` });
        forceReview = true;
      }
    } else {
      // Large gap — unambiguous pass
      reasons.push({ icon: 'x',
        text: `This looks like roughly a $${Math.round(job.evaluatedPrice)} job, but it would need to be about $${Math.round(job.minimumAcceptablePrice)} to justify the schedule time this week — ${Math.round(gapPercent * 100)}% gap` });
      forcePass = true;
    }
  } else {
    const quoteStr = Math.round(job.evaluatedPrice);
    const minStr = Math.round(job.minimumAcceptablePrice);
    if (quoteStr <= minStr * 1.1) {
      reasons.push({ icon: 'caution',
        text: `This job is expected to quote around $${quoteStr}, which is close to the $${minStr} minimum needed for the schedule time it consumes` });
      if (!forcePass) forceReview = true;
    } else {
      reasons.push({ icon: 'check',
        text: `This job is expected to quote around $${quoteStr} and only needs about $${minStr} to stay on pace` });
    }
  }

  // ─── Static Threshold Checks ───

  // Contribution profit vs absolute floor
  if (job.contributionProfit.expected < config.profitFloorAbsolute) {
    reasons.push({ icon: 'x', text: `Estimated profit $${Math.round(job.contributionProfit.expected)} is below minimum $${config.profitFloorAbsolute}` });
    forcePass = true;
  }

  // Contribution profit per labor hour vs minimum hourly rate
  if (job.contributionPerLaborHour.expected < config.minimumHourlyRate) {
    reasons.push({ icon: 'x', text: `At $${Math.round(job.contributionPerLaborHour.expected)} per work hour, this is below the $${config.minimumHourlyRate} minimum` });
    forcePass = true;
  } else {
    reasons.push({ icon: 'check', text: `Earns $${Math.round(job.contributionPerLaborHour.expected)} per work hour, meets $${config.minimumHourlyRate} minimum` });
  }

  // Contribution margin vs floor
  if (job.contributionMargin.expected < config.marginFloorPercent / 100) {
    reasons.push({ icon: 'x', text: `Margin ${Math.round(job.contributionMargin.expected * 100)}% is below ${config.marginFloorPercent}% floor` });
    forcePass = true;
  }

  // ─── Confidence Check ───
  // Always evaluated — reasons are preserved even when economics produce PASS

  if (job.confidence < config.confidenceThreshold) {
    reasons.push({ icon: 'caution', text: `Estimate confidence ${Math.round(job.confidence * 100)}% is below ${Math.round(config.confidenceThreshold * 100)}% threshold — needs review` });
    forceReview = true;
  }

  // ─── High/Conservative Case Check ───

  if (!forcePass) {
    const highCaseProfit = job.contributionProfit.low;
    const highCaseRate = job.contributionPerLaborHour.low;

    if (highCaseProfit < config.profitFloorAbsolute || highCaseRate < config.minimumHourlyRate) {
      reasons.push({ icon: 'caution', text: 'Conservative estimate may fall below profit thresholds' });
      forceReview = true;
    }
  }

  // ─── Risk Flags ───
  // Always evaluated — risk reasons are visible even on PASS recommendations

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
      reasons.push({ icon: 'x', text: `Job needs ~${job.capacityHours.toFixed(1)}h of schedule time but only ${context.remainingCapacityHours.toFixed(1)}h available this week` });
      forcePass = true;
    } else if (job.capacityHours > context.remainingCapacityHours * 0.5) {
      reasons.push({ icon: 'caution', text: `Job uses ${Math.round(job.capacityHours / context.remainingCapacityHours * 100)}% of remaining weekly capacity` });
    }

    // Weekly capacity pace — schedule-hour productivity (graduated, no hard PASS cliff)
    const required = context.requiredContributionPerCapacityHour;
    if (required > 0) {
      const rate = job.contributionPerCapacityHour;

      if (rate >= required) {
        reasons.push({ icon: 'check',
          text: `The hands-on work earns $${Math.round(job.contributionPerLaborHour.expected)} per work hour; including schedule time, it earns $${Math.round(rate)} per schedule hour (above $${Math.round(required)}/hr pace)` });
      } else if (rate >= required * 0.85) {
        reasons.push({ icon: 'caution',
          text: `The hands-on work pays $${Math.round(job.contributionPerLaborHour.expected)}/hr, but the job earns only $${Math.round(rate)} per schedule hour — close to the $${Math.round(required)}/hr pace needed` });
        const capacityRatio = context.remainingCapacityHours / config.weeklyCapacityHours;
        if (capacityRatio < 0.5 && !forcePass) forceReview = true;
      } else {
        reasons.push({ icon: 'x',
          text: `The hands-on work pays $${Math.round(job.contributionPerLaborHour.expected)}/hr, but the job consumes too much schedule capacity — only $${Math.round(rate)} per schedule hour vs $${Math.round(required)}/hr needed` });
        if (!forcePass) forceReview = true;
      }
    }

    // Goal completion positive signal
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
