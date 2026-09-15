/**
 * Actual cost categories for a completed job.
 *
 * All fields are numbers (dollars) or null if not recorded.
 * @typedef {Object} JobActuals
 * @property {number} finalAmount        - Amount collected from customer
 * @property {number|null} disposalCost  - Actual dump/disposal fees paid
 * @property {number|null} fuelCost      - Actual fuel/travel cost
 * @property {number|null} paidLabor     - Wages paid to crew (not owner)
 * @property {number|null} ownerLabor    - Owner's time valued at hourly rate
 * @property {number|null} paymentFees   - Card processing, platform fees
 * @property {number|null} otherCosts    - Any other direct costs
 * @property {number|null} actualTravelMinutes
 * @property {number|null} actualOnSiteMinutes
 * @property {number|null} actualTruckVolumePct
 * @property {string|null} additionalItems - Items found on site not in original request
 * @property {string|null} notes
 */

/**
 * Calculate actual profitability from completed job data.
 * Returns both cash profit (excluding owner labor) and
 * owner-adjusted profit (including owner labor as a cost).
 */
export function calculateActuals(actuals, estimate) {
  const finalAmount = Number(actuals.finalAmount) || 0;

  const disposalCost = num(actuals.disposalCost);
  const fuelCost = num(actuals.fuelCost);
  const paidLabor = num(actuals.paidLabor);
  const ownerLabor = num(actuals.ownerLabor);
  const paymentFees = num(actuals.paymentFees);
  const otherCosts = num(actuals.otherCosts);

  // Cash costs = everything except owner's own time
  const totalCashCosts = disposalCost + fuelCost + paidLabor + paymentFees + otherCosts;
  const cashProfit = finalAmount - totalCashCosts;
  const cashMargin = finalAmount > 0 ? cashProfit / finalAmount : 0;

  // Owner-adjusted = treats owner time as a real cost
  const totalFullCosts = totalCashCosts + ownerLabor;
  const ownerAdjustedProfit = finalAmount - totalFullCosts;
  const ownerAdjustedMargin = finalAmount > 0 ? ownerAdjustedProfit / finalAmount : 0;

  // Deltas vs estimate
  const deltas = {};
  if (estimate) {
    deltas.profitDelta = cashProfit - (estimate.estimatedProfit || 0);
    deltas.marginDelta = cashMargin - (estimate.estimatedMargin || 0);
    deltas.priceDelta = finalAmount - (estimate.recommendedPrice || 0);

    if (actuals.actualTravelMinutes != null && estimate.estimatedTravelMinutes != null) {
      deltas.travelDelta = Number(actuals.actualTravelMinutes) - estimate.estimatedTravelMinutes;
    }
    if (actuals.actualOnSiteMinutes != null && estimate.estimatedOnSiteHours != null) {
      deltas.onSiteDelta = Number(actuals.actualOnSiteMinutes) - (estimate.estimatedOnSiteHours * 60);
    }
    if (actuals.actualTruckVolumePct != null && estimate.estimatedVolumePct != null) {
      deltas.truckDelta = Number(actuals.actualTruckVolumePct) - estimate.estimatedVolumePct;
    }

    // Pricing accuracy: how close was the approved/collected amount to the estimate
    const quotedPrice = estimate.recommendedPrice || 0;
    if (quotedPrice > 0) {
      deltas.pricingAccuracy = 1 - Math.abs(finalAmount - quotedPrice) / quotedPrice;
    }
  }

  return {
    finalAmount,
    costs: {
      disposal: disposalCost,
      fuel: fuelCost,
      paidLabor,
      ownerLabor,
      paymentFees,
      otherCosts,
      totalCash: totalCashCosts,
      totalFull: totalFullCosts,
    },
    cashProfit,
    cashMargin,
    ownerAdjustedProfit,
    ownerAdjustedMargin,
    deltas,
  };
}

/**
 * Create an empty actuals object for the completion form.
 */
export function emptyActuals() {
  return {
    finalAmount: '',
    disposalCost: '',
    fuelCost: '',
    paidLabor: '',
    ownerLabor: '',
    paymentFees: '',
    otherCosts: '',
    actualTravelMinutes: '',
    actualOnSiteMinutes: '',
    actualTruckVolumePct: '',
    additionalItems: '',
    notes: '',
  };
}

function num(v) {
  const n = Number(v);
  return isNaN(n) || v === '' || v === null || v === undefined ? 0 : n;
}
