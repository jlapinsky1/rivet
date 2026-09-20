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
  suggestedPrice?: number;
  /** Week ask: what to send first. */
  askPrice?: number;
  /** Business floor only (no week pace). Lowest they can go without getting hurt. */
  walkAwayPrice?: number;
  /** Only set on Review. One concrete thing to check before sending a number. */
  lookFirst?: string;
};

/** Max of min-job / margin / profit / labor-rate floors. Ignores this week's pace. */
export function walkAwayFromFloors(job: EconomicJob): number {
  const f = job.pricingFloors;
  return Math.round(Math.max(
    f.minimumJob,
    f.margin,
    f.absoluteProfit,
    f.laborProductivity,
  ));
}

const GAP_BAND_LARGE = 0.25;
const SCARCE_CAPACITY_RATIO = 0.30;

function lookFirstFor(job: EconomicJob, lowConfidence: boolean): string | null {
  if (job.riskFlags.includes('hidden_water_damage')) return 'How far the water went';
  if (job.riskFlags.includes('unknown_substrate')) return "What's behind the wall once you open it";
  if (job.riskFlags.some(flag => flag.startsWith('structural_'))) {
    return 'Whether this is structural (might need a specialist)';
  }
  if (job.riskFlags.includes('unknown_job_family') || job.riskFlags.includes('unrecognized_job_class')) {
    return "What the actual job is. The photos don't show it";
  }
  if (job.riskFlags.includes('no_tasks_extracted') || job.riskFlags.includes('poor_component_coverage')) {
    return "The photos. They don't show the full job";
  }
  if (job.riskFlags.includes('unsupported_task_component')) {
    return "The part of the work Rivet doesn't recognize";
  }
  if (lowConfidence) return "The photos. We can't tell the full job yet";
  return null;
}

function pushRiskReasons(job: EconomicJob, reasons: ReasonItem[]): void {
  if (job.riskFlags.includes('no_tasks_extracted')) {
    reasons.push({ icon: 'caution', text: 'Could not identify specific work tasks - requires manual review' });
  }
  if (job.riskFlags.includes('poor_component_coverage')) {
    reasons.push({ icon: 'caution', text: 'Many work components not recognized - estimate less reliable' });
  }
  if (job.riskFlags.includes('unsupported_task_component')) {
    reasons.push({ icon: 'caution', text: 'Some work tasks not in Rivet\'s component library' });
  }
  if (job.riskFlags.includes('unrecognized_job_class')) {
    reasons.push({ icon: 'caution', text: 'Job classification was not recognized - estimate less reliable' });
  }
  if (job.riskFlags.includes('unknown_job_family')) {
    reasons.push({ icon: 'caution', text: 'Job type not recognized - requires manual review' });
  }
  for (const flag of job.riskFlags) {
    if (['no_tasks_extracted', 'poor_component_coverage', 'unsupported_task_component',
         'unrecognized_job_class', 'unknown_job_family', 'customer_supplied_compatibility'].includes(flag)) continue;
    if (flag.startsWith('structural_') || flag === 'hidden_water_damage' || flag === 'unknown_substrate') {
      reasons.push({ icon: 'caution', text: `Risk: ${flag.replace(/_/g, ' ')}` });
    }
  }
}

export function deriveRecommendation(
  job: EconomicJob,
  config: BusinessEconomicsConfig,
  context: DecisionContext,
): DecisionResult {
  const reasons: ReasonItem[] = [];
  let forceReview = false;
  let forcePass = false;
  let reprice = false;
  const sendPrice = Math.round(job.minimumAcceptablePrice);

  const hasContext = context.remainingCapacityHours > 0;
  const capacityRatio = hasContext && config.weeklyCapacityHours > 0
    ? context.remainingCapacityHours / config.weeklyCapacityHours
    : 1;
  const scarce = hasContext && capacityRatio < SCARCE_CAPACITY_RATIO;
  const doesNotFit = hasContext && job.capacityHours > context.remainingCapacityHours;

  const pricingGap = job.minimumAcceptablePrice - job.evaluatedPrice;
  const gapPercent = job.minimumAcceptablePrice > 0 && pricingGap > 0
    ? pricingGap / job.minimumAcceptablePrice
    : 0;

  if (doesNotFit) {
    reasons.push({ icon: 'x', text: `Job needs ~${job.capacityHours.toFixed(1)}h of schedule time but only ${context.remainingCapacityHours.toFixed(1)}h available this week` });
    forcePass = true;
  }

  if (pricingGap > 0 && !forcePass) {
    if (scarce && gapPercent > GAP_BAND_LARGE) {
      reasons.push({ icon: 'x',
        text: `This week is tight — even sending $${sendPrice} (current quote ~$${Math.round(job.evaluatedPrice)}) is a poor use of the ${context.remainingCapacityHours.toFixed(1)}h left` });
      forcePass = true;
    } else {
      reasons.push({ icon: 'caution',
        text: `Send $${sendPrice} instead of ~$${Math.round(job.evaluatedPrice)} to cover on-site time, travel, and this week's earnings pace` });
      reprice = true;
    }
  } else if (pricingGap <= 0) {
    const quoteStr = Math.round(job.evaluatedPrice);
    const minStr = Math.round(job.minimumAcceptablePrice);
    if (quoteStr > 0 && minStr > 0 && quoteStr <= minStr * 1.1) {
      reasons.push({ icon: 'check',
        text: `Quote around $${quoteStr} covers the $${minStr} needed for the schedule time this job uses` });
    } else if (quoteStr > 0) {
      reasons.push({ icon: 'check',
        text: `This job is expected to quote around $${quoteStr} and only needs about $${minStr} to stay on pace` });
    }
  }

  if (job.contributionProfit.expected < config.profitFloorAbsolute && pricingGap <= 0) {
    reasons.push({ icon: 'x', text: `Estimated profit $${Math.round(job.contributionProfit.expected)} is below minimum $${config.profitFloorAbsolute}` });
    forcePass = true;
  }

  if (job.contributionPerLaborHour.expected < config.minimumHourlyRate && pricingGap <= 0) {
    reasons.push({ icon: 'x', text: `At $${Math.round(job.contributionPerLaborHour.expected)} per work hour, this is below the $${config.minimumHourlyRate} minimum` });
    forcePass = true;
  } else if (job.contributionPerLaborHour.expected >= config.minimumHourlyRate) {
    reasons.push({ icon: 'check', text: `Earns $${Math.round(job.contributionPerLaborHour.expected)} per work hour, meets $${config.minimumHourlyRate} minimum` });
  }

  if (job.contributionMargin.expected < config.marginFloorPercent / 100 && pricingGap <= 0) {
    reasons.push({ icon: 'x', text: `Margin ${Math.round(job.contributionMargin.expected * 100)}% is below ${config.marginFloorPercent}% floor` });
    forcePass = true;
  }

  const lowConfidence = job.confidence < config.confidenceThreshold;
  if (lowConfidence) {
    reasons.push({ icon: 'caution', text: `Estimate confidence ${Math.round(job.confidence * 100)}% is below ${Math.round(config.confidenceThreshold * 100)}% threshold - needs review` });
  }

  pushRiskReasons(job, reasons);
  const lookFirst = lookFirstFor(job, lowConfidence);
  if (lookFirst) {
    forceReview = true;
    reasons.unshift({ icon: 'caution', text: `Look first: ${lookFirst}` });
    if (job.riskFlags.includes('no_tasks_extracted') || job.riskFlags.includes('unknown_job_family')) {
      forcePass = false;
    }
  }

  if (hasContext && !doesNotFit) {
    if (job.capacityHours > context.remainingCapacityHours * 0.5) {
      reasons.push({ icon: 'caution', text: `Job uses ${Math.round(job.capacityHours / context.remainingCapacityHours * 100)}% of remaining weekly capacity` });
    }

    const required = context.requiredContributionPerCapacityHour;
    if (required > 0) {
      const rate = job.contributionPerCapacityHour;
      if (rate >= required) {
        reasons.push({ icon: 'check',
          text: `Including drive and shop time, it earns $${Math.round(rate)} per schedule hour (above $${Math.round(required)}/hr pace)` });
      } else if (reprice || forcePass) {
        reasons.push({ icon: 'caution',
          text: `At the current quote this is $${Math.round(rate)} per schedule hour vs $${Math.round(required)}/hr needed` });
      } else if (rate >= required * 0.85) {
        reasons.push({ icon: 'caution',
          text: `Close to pace: $${Math.round(rate)} per schedule hour vs $${Math.round(required)}/hr needed` });
      } else {
        reasons.push({ icon: 'caution',
          text: `Below pace at the current quote: $${Math.round(rate)} per schedule hour vs $${Math.round(required)}/hr needed` });
      }
    }

    const projectedWeekly = context.weeklyEarningsToDate + job.contributionProfit.expected;
    if (projectedWeekly >= config.weeklyEarningsGoal && !forcePass) {
      reasons.push({ icon: 'check', text: 'This job puts you ahead of your weekly earnings goal' });
    }
  }

  let recommendation: Recommendation;
  if (forcePass) {
    recommendation = 'pass';
  } else if (forceReview) {
    recommendation = 'review';
  } else if (reprice) {
    recommendation = 'take_at_price';
  } else {
    recommendation = 'take';
  }

  const walkAway = walkAwayFromFloors(job);
  const ask = recommendation === 'take_at_price'
    ? sendPrice
    : Math.round(job.evaluatedPrice);

  return {
    recommendation,
    reasons,
    suggestedPrice: recommendation === 'take_at_price' ? sendPrice : undefined,
    askPrice: recommendation === 'pass' ? undefined : ask,
    walkAwayPrice: walkAway,
    lookFirst: recommendation === 'review' ? lookFirst ?? undefined : undefined,
  };
}
