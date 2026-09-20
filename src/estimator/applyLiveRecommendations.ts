import type { DecisionContext, EconomicJob, EstimationRun, Recommendation, ReasonItem } from './types';
import { deriveRecommendation } from './decision';
import { refreshEconomicJobForContext } from './estimator';
import { buildDecisionContext } from './weekContext';
import { economicsFromSettings } from './economicsFromSettings';

export type LiveRecItem = {
  id: number;
  opStatus: string;
  profit: number;
  hoursNum: number;
  recommendation: Recommendation;
  reasons: ReasonItem[];
  price: number;
  estimationRunId?: string;
  intakeRecommendation?: Recommendation;
  suggestedPrice?: number;
  walkAwayPrice?: number;
  lookFirst?: string;
  countsTowardCurrentWeek?: boolean;
};

export function applyLiveRecommendations<T extends LiveRecItem>(
  items: T[],
  runs: EstimationRun[],
  settings: Record<string, unknown> | undefined,
  businessId: string,
): T[] {
  const config = economicsFromSettings(settings, businessId);
  const ctx: DecisionContext = buildDecisionContext(
    items.map(i => ({
      opStatus: i.opStatus,
      profit: i.profit,
      hoursNum: i.hoursNum,
      countsTowardCurrentWeek: i.countsTowardCurrentWeek,
    })),
    { weeklyGoal: config.weeklyEarningsGoal, weeklyHours: config.weeklyCapacityHours },
  );
  const runsById = new Map(runs.map(r => [r.id, r]));

  return items.map((item) => {
    if (item.opStatus !== 'needs_review' || !item.estimationRunId) return item;
    const run = runsById.get(item.estimationRunId);
    if (!run?.economicJob) return item;

    const liveJob: EconomicJob = refreshEconomicJobForContext(run.economicJob, config, ctx);
    const decision = deriveRecommendation(liveJob, config, ctx);
    const displayPrice = decision.suggestedPrice ?? item.price;

    return {
      ...item,
      intakeRecommendation: item.intakeRecommendation ?? item.recommendation,
      recommendation: decision.recommendation,
      reasons: decision.reasons,
      suggestedPrice: decision.suggestedPrice,
      walkAwayPrice: decision.walkAwayPrice,
      lookFirst: decision.lookFirst,
      price: decision.recommendation === 'take_at_price' ? displayPrice : item.price,
    };
  });
}
