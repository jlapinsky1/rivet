/**
 * Route scoring - score routes, compare scenarios, optimize stop order.
 * Modest implementation for Phase 4.
 */

import { haversineDistance } from './routeContext.js';

const DEFAULT_COST_PER_MILE = 0.58; // IRS standard rate approximation
const DEFAULT_MINUTES_PER_MILE = 2;
const DEFAULT_DUMP_FEE = 75;

/**
 * Score a route (ordered stops) for total distance, time, fuel, and dump costs.
 *
 * @param {Array<{ lat, lng, type, estimatedVolumePct?, estimatedOnSiteMinutes? }>} orderedStops
 *   type: 'home' | 'job' | 'landfill'
 * @param {{ costPerMile?, minutesPerMile?, dumpFee? }} [settings={}]
 * @returns {{ totalMiles, totalMinutes, fuelCost, dumpTrips, dumpFees, stops }}
 */
export function scoreRoute(orderedStops, settings = {}) {
  const costPerMile = settings.costPerMile || DEFAULT_COST_PER_MILE;
  const minPerMile = settings.minutesPerMile || DEFAULT_MINUTES_PER_MILE;
  const dumpFee = settings.dumpFee || DEFAULT_DUMP_FEE;

  let totalMiles = 0;
  let totalTravelMinutes = 0;
  let totalOnSiteMinutes = 0;
  let dumpTrips = 0;

  const scoredStops = [];

  for (let i = 0; i < orderedStops.length; i++) {
    const stop = orderedStops[i];
    let legMiles = 0;
    let legMinutes = 0;

    if (i > 0) {
      const prev = orderedStops[i - 1];
      legMiles = haversineDistance(prev.lat, prev.lng, stop.lat, stop.lng);
      legMinutes = Math.round(legMiles * minPerMile);
      totalMiles += legMiles;
      totalTravelMinutes += legMinutes;
    }

    if (stop.type === 'landfill') dumpTrips++;
    if (stop.type === 'job') totalOnSiteMinutes += (stop.estimatedOnSiteMinutes || 0);

    scoredStops.push({
      ...stop,
      legMiles: Math.round(legMiles * 10) / 10,
      legMinutes,
    });
  }

  totalMiles = Math.round(totalMiles * 10) / 10;
  const totalMinutes = totalTravelMinutes + totalOnSiteMinutes;

  return {
    totalMiles,
    totalMinutes,
    travelMinutes: totalTravelMinutes,
    onSiteMinutes: totalOnSiteMinutes,
    fuelCost: Math.round(totalMiles * costPerMile * 100) / 100,
    dumpTrips,
    dumpFees: dumpTrips * dumpFee,
    stops: scoredStops,
  };
}

/**
 * Compare two route scenarios and determine which is better.
 *
 * @param {Object} scenarioA - result from scoreRoute + { expectedProfit }
 * @param {Object} scenarioB - result from scoreRoute + { expectedProfit }
 * @returns {{ winner: 'A'|'B'|'tie', savings: { miles, minutes, fuel, dumpFees }, reasons: string[] }}
 */
export function compareScenarios(scenarioA, scenarioB) {
  const netA = (scenarioA.expectedProfit || 0) - scenarioA.fuelCost - scenarioA.dumpFees;
  const netB = (scenarioB.expectedProfit || 0) - scenarioB.fuelCost - scenarioB.dumpFees;

  const reasons = [];
  let winner;

  if (Math.abs(netA - netB) < 1) {
    winner = 'tie';
    reasons.push('Both scenarios yield similar net profit.');
  } else if (netA > netB) {
    winner = 'A';
    reasons.push(`Scenario A nets $${(netA - netB).toFixed(0)} more profit.`);
  } else {
    winner = 'B';
    reasons.push(`Scenario B nets $${(netB - netA).toFixed(0)} more profit.`);
  }

  const mileDiff = scenarioA.totalMiles - scenarioB.totalMiles;
  if (Math.abs(mileDiff) > 1) {
    reasons.push(`${mileDiff > 0 ? 'B' : 'A'} saves ${Math.abs(mileDiff).toFixed(1)} miles.`);
  }

  const dumpDiff = scenarioA.dumpFees - scenarioB.dumpFees;
  if (dumpDiff !== 0) {
    reasons.push(`${dumpDiff > 0 ? 'B' : 'A'} saves $${Math.abs(dumpDiff)} in dump fees.`);
  }

  return {
    winner,
    savings: {
      miles: Math.round(Math.abs(mileDiff) * 10) / 10,
      minutes: Math.abs(scenarioA.totalMinutes - scenarioB.totalMinutes),
      fuel: Math.round(Math.abs(scenarioA.fuelCost - scenarioB.fuelCost) * 100) / 100,
      dumpFees: Math.abs(dumpDiff),
    },
    reasons,
  };
}

/**
 * Optimize stop order using nearest-neighbor heuristic.
 * Sufficient for 2-4 daily stops.
 *
 * @param {Array<{ lat, lng, type }>} stops - job stops only (no home/landfill)
 * @param {{ lat, lng }} homeBase
 * @param {{ lat, lng }} [landfill] - if provided, adds a landfill stop at the end before returning home
 * @returns {Array} reordered stops including home start/end and optional landfill
 */
export function optimizeStopOrder(stops, homeBase, landfill) {
  if (!stops.length) {
    return [{ ...homeBase, type: 'home' }];
  }

  const remaining = [...stops];
  const ordered = [];
  let current = homeBase;

  while (remaining.length > 0) {
    let nearestIdx = 0;
    let nearestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const dist = haversineDistance(current.lat, current.lng, remaining[i].lat, remaining[i].lng);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIdx = i;
      }
    }

    const next = remaining.splice(nearestIdx, 1)[0];
    ordered.push(next);
    current = next;
  }

  const route = [
    { ...homeBase, type: 'home' },
    ...ordered,
  ];

  if (landfill) {
    route.push({ ...landfill, type: 'landfill' });
  }

  route.push({ ...homeBase, type: 'home' });

  return route;
}
