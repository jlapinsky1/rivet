/**
 * Decision rules for evaluating whether to Take, Review, or Pass on a job.
 *
 * Rule types:
 *   hard  - failure = automatic Pass (loss protection, true blockers)
 *   gate  - failure = forced Review (operational concern, not an auto-reject)
 *   soft  - contributes to the composite score via bonuses/penalties
 *
 * Safety guardrails (minimum_job_profit, minimum_margin) are now named
 * "Absolute Profit Floor" and "Absolute Margin Floor" - owner-configured
 * hard limits that do not change dynamically.
 *
 * Dynamic rules use context.dynamicTargets (from calculateDynamicTargets)
 * to evaluate jobs relative to the current business situation.
 */

export const DECISION_RULES = [
  // ── Hard rules (automatic Pass) ──
  {
    id: 'negative_profit',
    name: 'Negative Profit',
    type: 'hard',
    evaluate(ctx) {
      const profit = ctx.estimate?.estimatedProfit;
      if (profit == null) return { result: 'skip', message: 'No profit estimate' };
      if (profit < 0) return { result: 'fail', message: `Expected loss of $${Math.abs(Math.round(profit))}` };
      return { result: 'pass', message: `Expected profit $${Math.round(profit)}` };
    },
  },
  {
    id: 'prohibited_material',
    name: 'Prohibited Material / True Blocker',
    type: 'hard',
    evaluate(ctx) {
      const blockers = (ctx.riskFlags || []).filter(f =>
        f.severity === 'blocker' && !ctx.blockerOverrides?.[f.type]
      );
      if (blockers.length > 0) {
        return { result: 'fail', message: `${blockers.length} unresolved blocker(s): ${blockers.map(b => b.label || b.type).join(', ')}` };
      }
      return { result: 'pass', message: 'No blockers' };
    },
  },
  {
    id: 'dual_floor',
    name: 'Dual Floor (Below Both Safety Guardrails)',
    type: 'hard',
    evaluate(ctx) {
      const profit = ctx.estimate?.estimatedProfit;
      const margin = ctx.estimate?.estimatedMargin;
      const minProfit = ctx.goal?.minimum_job_profit ?? 75;
      const minMargin = ctx.goal?.minimum_margin ?? 0.55;

      if (profit == null || margin == null) return { result: 'skip', message: 'Insufficient data' };

      if (profit < minProfit && margin < minMargin) {
        return {
          result: 'fail',
          message: `Both profit ($${Math.round(profit)}) and margin (${(margin * 100).toFixed(0)}%) are below absolute floors`,
        };
      }
      return { result: 'pass', message: 'Passes dual floor check' };
    },
  },

  // ── Gate rules (force Review, not Pass) ──
  {
    id: 'below_profit_floor',
    name: 'Below Absolute Profit Floor',
    type: 'gate',
    evaluate(ctx) {
      const profit = ctx.estimate?.estimatedProfit;
      const minProfit = ctx.goal?.minimum_job_profit ?? 75;
      if (profit == null) return { result: 'skip', message: 'No profit estimate' };
      if (profit < minProfit) {
        return { result: 'review', message: `Profit $${Math.round(profit)} below $${minProfit} safety floor` };
      }
      return { result: 'pass', message: `Profit $${Math.round(profit)} above $${minProfit} safety floor` };
    },
  },
  {
    id: 'below_margin_floor',
    name: 'Below Absolute Margin Floor',
    type: 'gate',
    evaluate(ctx) {
      const margin = ctx.estimate?.estimatedMargin;
      const minMargin = ctx.goal?.minimum_margin ?? 0.55;
      if (margin == null) return { result: 'skip', message: 'No margin estimate' };
      if (margin < minMargin) {
        return { result: 'review', message: `Margin ${(margin * 100).toFixed(0)}% below ${(minMargin * 100).toFixed(0)}% safety floor` };
      }
      return { result: 'pass', message: `Margin ${(margin * 100).toFixed(0)}% above ${(minMargin * 100).toFixed(0)}% safety floor` };
    },
  },
  {
    id: 'low_confidence',
    name: 'Low Estimate Confidence',
    type: 'gate',
    evaluate(ctx) {
      if (!ctx.confidence) return { result: 'skip', message: 'No confidence data' };
      if (ctx.confidence.level === 'low') {
        return { result: 'review', message: 'Low confidence - manual review needed' };
      }
      return { result: 'pass', message: `${ctx.confidence.level} confidence` };
    },
  },
  {
    id: 'capacity_conflict',
    name: 'Capacity Conflict',
    type: 'gate',
    evaluate(ctx) {
      if (!ctx.scheduleContext) return { result: 'skip', message: 'No schedule data' };
      const { jobsToday, capacityLimit } = ctx.scheduleContext;
      if (jobsToday >= capacityLimit) {
        return { result: 'review', message: `At daily capacity (${capacityLimit} jobs)` };
      }
      return { result: 'pass', message: `${capacityLimit - jobsToday} slots available` };
    },
  },

  // ── Soft rules (score contribution) ──
  {
    id: 'goal_pace',
    name: 'Goal Pace Impact',
    type: 'soft',
    weight: 0.15,
    evaluate(ctx) {
      if (!ctx.goalProgress) return { result: 'skip', message: 'No active goal' };
      const pace = ctx.goalProgress.paceStatus;
      if (pace === 'achieved') return { result: 'pass', message: 'Goal achieved - be selective', data: { bonus: -0.05 } };
      if (pace === 'behind') return { result: 'pass', message: 'Behind pace - take profitable jobs', data: { bonus: 0.15 } };
      if (pace === 'at_risk') return { result: 'pass', message: 'At risk - prioritize good jobs', data: { bonus: 0.10 } };
      if (pace === 'ahead') return { result: 'pass', message: 'Ahead of pace - can be selective', data: { bonus: -0.05 } };
      return { result: 'pass', message: 'On pace', data: { bonus: 0 } };
    },
  },
  {
    id: 'job_rating',
    name: 'Job Quality Rating',
    type: 'soft',
    weight: 0.20,
    evaluate(ctx) {
      if (!ctx.jobRating) return { result: 'skip', message: 'No rating' };
      const r = ctx.jobRating.rating;
      if (r === 'excellent') return { result: 'pass', message: 'Excellent job quality', data: { bonus: 0.20 } };
      if (r === 'good') return { result: 'pass', message: 'Good job quality', data: { bonus: 0.10 } };
      if (r === 'marginal') return { result: 'pass', message: 'Marginal job quality', data: { bonus: -0.05 } };
      return { result: 'pass', message: 'Poor job quality', data: { bonus: -0.15 } };
    },
  },
  {
    id: 'confidence_score',
    name: 'Estimate Confidence',
    type: 'soft',
    weight: 0.10,
    evaluate(ctx) {
      if (!ctx.confidence) return { result: 'skip', message: 'No confidence data' };
      if (ctx.confidence.level === 'high') return { result: 'pass', message: 'High confidence', data: { bonus: 0.05 } };
      if (ctx.confidence.level === 'medium') return { result: 'pass', message: 'Medium confidence', data: { bonus: 0 } };
      return { result: 'pass', message: 'Low confidence', data: { bonus: -0.10 } };
    },
  },
  {
    id: 'profit_vs_daily_target',
    name: 'Profit vs Daily Target',
    type: 'soft',
    weight: 0.10,
    evaluate(ctx) {
      if (!ctx.goalProgress) return { result: 'skip', message: 'No goal' };
      const profit = ctx.estimate?.estimatedProfit || 0;
      const required = ctx.goalProgress.requiredDailyProfit;
      if (required <= 0) return { result: 'pass', message: 'Goal already met', data: { bonus: 0 } };
      const ratio = profit / required;
      if (ratio >= 0.75) return { result: 'pass', message: `Covers ${(ratio * 100).toFixed(0)}% of daily target`, data: { bonus: 0.10 } };
      if (ratio >= 0.40) return { result: 'pass', message: `Covers ${(ratio * 100).toFixed(0)}% of daily target`, data: { bonus: 0.03 } };
      return { result: 'pass', message: `Only covers ${(ratio * 100).toFixed(0)}% of daily target`, data: { bonus: -0.03 } };
    },
  },
  {
    id: 'travel_efficiency',
    name: 'Travel Efficiency',
    type: 'soft',
    weight: 0.10,
    evaluate(ctx) {
      const travel = ctx.estimate?.estimatedTravelMinutes;
      if (travel == null) return { result: 'skip', message: 'No travel estimate' };
      if (!ctx.estimate?.hasDistanceData) {
        return { result: 'pass', message: 'Travel not verified - using placeholder estimate', data: { bonus: -0.08 } };
      }
      if (travel <= 30) return { result: 'pass', message: 'Short travel - efficient', data: { bonus: 0.05 } };
      if (travel <= 60) return { result: 'pass', message: 'Normal travel time', data: { bonus: 0 } };
      if (travel <= 90) return { result: 'pass', message: 'Long travel time', data: { bonus: -0.05 } };
      return { result: 'pass', message: `Very long travel (${travel} min)`, data: { bonus: -0.10 } };
    },
  },
  {
    id: 'schedule_utilization',
    name: 'Schedule Utilization',
    type: 'soft',
    weight: 0.10,
    evaluate(ctx) {
      if (!ctx.scheduleContext) return { result: 'skip', message: 'No schedule data' };
      const { jobsToday, capacityLimit } = ctx.scheduleContext;
      const utilization = jobsToday / capacityLimit;
      if (utilization >= 1) return { result: 'pass', message: 'At capacity', data: { bonus: -0.10 } };
      if (utilization >= 0.75) return { result: 'pass', message: 'Near capacity', data: { bonus: -0.03 } };
      if (utilization <= 0.25) return { result: 'pass', message: 'Light schedule - fills unused capacity', data: { bonus: 0.10 } };
      return { result: 'pass', message: 'Moderate schedule', data: { bonus: 0 } };
    },
  },

  // ── Dynamic rules (use dynamicTargets from calculateDynamicTargets) ──
  {
    id: 'slot_value',
    name: 'Slot Value Assessment',
    type: 'soft',
    weight: 0.15,
    evaluate(ctx) {
      if (!ctx.dynamicTargets) return { result: 'skip', message: 'No dynamic targets' };
      const dt = ctx.dynamicTargets;
      const profit = ctx.estimate?.estimatedProfit || 0;

      if (dt.todayCovered) {
        // Today's goal is already met - this slot is bonus capacity
        return { result: 'pass', message: 'Daily target already covered - bonus capacity', data: { bonus: -0.03 } };
      }

      if (dt.openSlots <= 0) {
        return { result: 'pass', message: 'No open slots - would exceed capacity', data: { bonus: -0.10 } };
      }

      const suggested = dt.suggestedPerSlot;
      if (suggested <= 0) {
        return { result: 'pass', message: 'No remaining profit needed', data: { bonus: 0 } };
      }

      const ratio = profit / suggested;
      if (ratio >= 1.0) {
        return { result: 'pass', message: `Meets slot target (${fmtC(profit)} vs ~${fmtC(suggested)}/slot)`, data: { bonus: 0.12 } };
      }
      if (ratio >= 0.70) {
        return { result: 'pass', message: `Close to slot target (${fmtC(profit)} vs ~${fmtC(suggested)}/slot)`, data: { bonus: 0.05 } };
      }
      if (ratio >= 0.40) {
        return { result: 'pass', message: `Below slot target (${fmtC(profit)} vs ~${fmtC(suggested)}/slot)`, data: { bonus: -0.03 } };
      }
        return { result: 'pass', message: `Well below slot profit target (${fmtC(profit)} profit vs ~${fmtC(suggested)} needed/slot)`, data: { bonus: -0.08 } };
    },
  },
  {
    id: 'capacity_scarcity',
    name: 'Capacity Scarcity',
    type: 'soft',
    weight: 0.10,
    evaluate(ctx) {
      if (!ctx.dynamicTargets) return { result: 'skip', message: 'No dynamic targets' };
      const dt = ctx.dynamicTargets;
      const profit = ctx.estimate?.estimatedProfit || 0;
      const suggested = dt.suggestedPerSlot;

      // When capacity is scarce, only accept strong jobs
      if (dt.openSlots === 1 && !dt.todayCovered) {
        // Last slot - only worth it if the job meaningfully contributes
        if (suggested > 0 && profit < suggested * 0.60) {
          return { result: 'pass', message: `Last open slot - ${fmtC(profit)} profit unlikely the best use`, data: { bonus: -0.10 } };
        }
        if (suggested > 0 && profit >= suggested) {
          return { result: 'pass', message: `Last slot and job meets target - good use of capacity`, data: { bonus: 0.08 } };
        }
        return { result: 'pass', message: 'Last open slot - consider carefully', data: { bonus: -0.05 } };
      }

      if (dt.capacityScarcity >= 0.75 && !dt.todayCovered) {
        // Near capacity - raise the bar slightly
        return { result: 'pass', message: 'Near capacity - be selective', data: { bonus: -0.03 } };
      }

      if (dt.openSlots >= 3 && dt.urgency >= 0.6) {
        // Plenty of room and behind pace - be open to jobs
        return { result: 'pass', message: 'Open capacity and behind pace - filling slots helps', data: { bonus: 0.05 } };
      }

      return { result: 'skip', message: 'Normal capacity' };
    },
  },
];

function fmtC(n) { return '$' + Math.round(n); }
