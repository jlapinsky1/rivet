import { calculateQuote } from './pricing';
import { getSettings } from './storage';

const ACCESS_MAP = {
  curbside: 'Curbside / already outside',
  garage: 'Garage / driveway',
  first_floor: 'Inside first floor',
  upstairs: 'Upstairs / basement',
  basement: 'Upstairs / basement',
};

const QUANTITY_TO_LOAD = {
  'Single item': 'Single item curbside',
  'A few items (1-5)': 'Normal small job',
  'A room worth of stuff': 'Quarter truck/trailer',
  'Multiple rooms': 'Three-quarter truck/trailer',
  'Whole house / cleanout': 'Full truck/trailer',
};

const QUANTITY_TO_TRUCK = {
  'Single item': { volumePct: 10, weightRisk: false },
  'A few items (1-5)': { volumePct: 15, weightRisk: false },
  'A room worth of stuff': { volumePct: 25, weightRisk: false },
  'Multiple rooms': { volumePct: 75, weightRisk: false },
  'Whole house / cleanout': { volumePct: 100, weightRisk: true },
};

const QUANTITY_TO_DUMPS = {
  'Single item': 1,
  'A few items (1-5)': 1,
  'A room worth of stuff': 1,
  'Multiple rooms': 2,
  'Whole house / cleanout': 2,
};

const QUANTITY_TO_HOURS = {
  'Single item': 0.25,
  'A few items (1-5)': 0.5,
  'A room worth of stuff': 1,
  'Multiple rooms': 2,
  'Whole house / cleanout': 3.5,
};

const STAIRS_TIME_ADD = {
  none: 0,
  few: 0.1,
  one_flight: 0.25,
  multiple: 0.5,
};

const ACCESS_TIME_ADD = {
  curbside: 0,
  garage: 0,
  first_floor: 0.15,
  upstairs: 0.3,
  basement: 0.3,
};

const DIFFICULT_ITEMS = [
  'sleeper sofa', 'sofa bed', 'hide-a-bed',
  'safe', 'gun safe',
  'piano', 'organ',
  'hot tub', 'spa',
  'pool table',
  'cast iron tub',
];

const HEAVY_ITEMS = [
  'refrigerator', 'fridge',
  'washer', 'dryer',
  'dishwasher',
  'oven', 'stove', 'range',
  'water heater',
  'treadmill', 'elliptical', 'exercise',
  ...DIFFICULT_ITEMS,
];

const WEIGHT_RISK_ITEMS = [
  'concrete', 'brick', 'cinder block', 'stone',
  'dirt', 'soil', 'gravel', 'sand',
  'cast iron', 'safe', 'gun safe',
  'piano', 'grand piano',
  'pool table',
  'tile', 'ceramic',
  ...HEAVY_ITEMS,
];

/**
 * Builds a detailed internal estimate from a customer booking.
 * Tracks missing inputs explicitly - never silently defaults critical
 * financial fields to zero.
 */
export function buildEstimate(booking, settingsOverride) {
  const settings = settingsOverride || getSettings();
  const missingInputs = [];

  // --- Map customer fields to pricing fields ---

  const accessType = ACCESS_MAP[booking.accessType];
  if (!accessType) {
    missingInputs.push({ field: 'accessType', message: 'Unknown access type', financial: false });
  }

  const loadSize = QUANTITY_TO_LOAD[booking.quantity];
  if (!loadSize) {
    missingInputs.push({ field: 'quantity', message: 'Quantity not provided or unrecognized', financial: true });
  }

  // --- Truck capacity ---

  const truckInfo = QUANTITY_TO_TRUCK[booking.quantity] || null;
  const estimatedVolumePct = truckInfo?.volumePct ?? null;
  const numberOfDumpLoads = QUANTITY_TO_DUMPS[booking.quantity] ?? null;

  if (estimatedVolumePct === null) {
    missingInputs.push({ field: 'truckCapacity', message: 'Cannot estimate truck volume - quantity unknown', financial: true });
  }
  if (numberOfDumpLoads === null) {
    missingInputs.push({ field: 'dumpLoads', message: 'Cannot estimate dump loads - quantity unknown', financial: true });
  }

  // --- Detect item-based attributes ---

  const detectedNames = (booking.detectedItems || []).map(i => i.item.toLowerCase());
  const hasHeavyItems = detectedNames.some(name =>
    HEAVY_ITEMS.some(h => name.includes(h))
  );
  const hasDifficultItems = detectedNames.some(name =>
    DIFFICULT_ITEMS.some(d => name.includes(d))
  );
  const hasAppliances = detectedNames.some(name =>
    ['refrigerator', 'fridge', 'washer', 'dryer', 'dishwasher', 'oven', 'stove', 'range', 'water heater', 'microwave'].some(a => name.includes(a))
  );
  const hasMattress = detectedNames.some(name => name.includes('mattress'));
  const hasWeightRiskItems = detectedNames.some(name =>
    WEIGHT_RISK_ITEMS.some(w => name.includes(w))
  );

  // --- Build add-ons ---

  const addOns = [];
  if (booking.stairs === 'one_flight' || booking.stairs === 'multiple') {
    addOns.push('Stairs');
  }
  if (hasHeavyItems) addOns.push('Heavy item');
  if (hasAppliances) addOns.push('Appliance');
  if (hasMattress) addOns.push('Mattress');
  if (booking.accessType !== 'curbside' && booking.accessType !== 'garage' &&
      (booking.stairs === 'one_flight' || booking.stairs === 'multiple')) {
    addOns.push('Long carry');
  }

  // --- Disposal cost ---

  if (!settings.dumpFee && settings.dumpFee !== 0) {
    missingInputs.push({ field: 'dumpFee', message: 'Dump fee not configured in settings', financial: true });
  }
  const disposalAllowance = (settings.dumpFee || 0) * (numberOfDumpLoads || 1);

  // --- Distance / travel ---
  // We do NOT have actual distance data at estimate time.
  // Flag this explicitly rather than defaulting to zero.

  const hasDistanceData = booking.travelMinutes != null || booking.distanceMiles != null;
  if (!hasDistanceData) {
    missingInputs.push({
      field: 'distance',
      message: 'Travel time estimated - geocoding pending.',
      financial: false,
    });
  }

  const oneWayMiles = booking.distanceMiles != null
    ? Number(booking.distanceMiles)
    : (booking.travelMinutes != null ? (booking.travelMinutes / 60) * 30 : null);

  const estimatedTravelMinutes = booking.travelMinutes != null
    ? booking.travelMinutes
    : (oneWayMiles != null ? Math.max(5, Math.round((oneWayMiles / 30) * 60)) : 30);

  const homeBaseToJob = oneWayMiles ?? 0;
  const jobToLandfill = oneWayMiles != null ? Math.min(30, Math.max(8, oneWayMiles * 0.35)) : 0;
  const estimatedFuelCost = oneWayMiles != null
    ? Math.round(((oneWayMiles * 2) + jobToLandfill) / (settings.mpg || 15) * (settings.gasPrice || 3.50))
    : Math.round((estimatedTravelMinutes / 60) * (settings.gasPrice || 3.50) / (settings.mpg || 15) * 40);

  // --- On-site duration ---

  const baseOnSiteHours = QUANTITY_TO_HOURS[booking.quantity] || null;
  if (baseOnSiteHours === null) {
    missingInputs.push({ field: 'onSiteTime', message: 'Cannot estimate on-site time - quantity unknown', financial: true });
  }
  const stairsAdd = STAIRS_TIME_ADD[booking.stairs] || 0;
  const accessAdd = ACCESS_TIME_ADD[booking.accessType] || 0;
  const heavyAdd = hasHeavyItems ? 0.25 : 0;
  const difficultAdd = hasDifficultItems ? 0.5 : 0;
  const estimatedOnSiteHours = (baseOnSiteHours || 1) + stairsAdd + accessAdd + heavyAdd + difficultAdd;

  // --- Labor allowance ---

  const laborRate = 50; // $/hr assumed for labor allowance calc
  const laborAllowance = Math.round(estimatedOnSiteHours * laborRate);

  // --- Run existing pricing engine ---

  const quoteResult = calculateQuote({
    loadSize: loadSize || 'Half truck/trailer',
    accessType: accessType || 'Curbside / already outside',
    addOns,
    numberOfDumpLoads: numberOfDumpLoads || 1,
    priceSensitivity: 'balanced',
    homeBaseToJob,
    jobToLandfill,
    landfillToHomeBase: jobToLandfill,
    estimatedJobTime: estimatedOnSiteHours,
  }, settings);

  // --- Build itemized breakdown ---

  const breakdown = [];
  breakdown.push({
    label: `Base price (${loadSize || 'unknown'})`,
    value: quoteResult.basePrice,
    type: 'price',
  });
  if (quoteResult.accessModifier !== 0) {
    breakdown.push({
      label: `Access adjustment (${accessType || 'unknown'})`,
      value: quoteResult.accessModifier,
      type: 'price',
    });
  }
  for (const addon of addOns) {
    const price = settings.addOnPrices[addon] || 0;
    if (price !== 0) {
      breakdown.push({ label: `${addon} adjustment`, value: price, type: 'price' });
    }
  }
  if (quoteResult.distanceSurcharge !== 0) {
    breakdown.push({ label: 'Distance surcharge', value: quoteResult.distanceSurcharge, type: 'price' });
  }
  breakdown.push({
    label: `Disposal allowance (${numberOfDumpLoads || '?'} load${(numberOfDumpLoads || 0) !== 1 ? 's' : ''})`,
    value: disposalAllowance,
    type: 'cost',
  });
  breakdown.push({
    label: `Labor allowance (${estimatedOnSiteHours.toFixed(1)} hrs)`,
    value: laborAllowance,
    type: 'cost',
  });
  breakdown.push({
    label: `Travel allowance (est. ${estimatedTravelMinutes} min)`,
    value: estimatedFuelCost,
    type: 'cost',
    unverified: !hasDistanceData,
  });

  // --- Minimum price check ---

  const wasMinimumApplied = quoteResult.suggestedQuote > quoteResult.quoteSubtotal;
  if (wasMinimumApplied) {
    breakdown.push({
      label: 'Minimum price adjustment',
      value: settings.minimumPrice - quoteResult.quoteSubtotal,
      type: 'adjustment',
    });
  }

  // --- Target margin floor ---

  const estimatedDirectCost = disposalAllowance + estimatedFuelCost + laborAllowance;
  const targetMargin = 0.70;
  const marginFloor = Math.ceil(estimatedDirectCost / (1 - targetMargin) / 5) * 5;
  const marginAdjustment = Math.max(0, marginFloor - quoteResult.suggestedQuote);
  if (marginAdjustment > 0) {
    breakdown.push({
      label: `Target margin adjustment (${(targetMargin * 100).toFixed(0)}%)`,
      value: marginAdjustment,
      type: 'adjustment',
    });
  }

  const recommendedPrice = Math.max(quoteResult.suggestedQuote, marginFloor);
  const estimatedProfit = recommendedPrice - estimatedDirectCost;
  const estimatedMargin = recommendedPrice > 0 ? estimatedProfit / recommendedPrice : 0;

  // --- Weight risk flag ---

  let weightRisk = false;
  let weightRiskReason = null;
  if (hasWeightRiskItems) {
    weightRisk = true;
    weightRiskReason = 'Items detected that may exceed weight expectations for estimated volume';
  }
  if (truckInfo?.weightRisk) {
    weightRisk = true;
    weightRiskReason = weightRiskReason
      ? weightRiskReason + '; full load may approach payload limits'
      : 'Full load may approach payload limits';
  }

  return {
    recommendedPrice,
    estimatedProfit: Math.round(estimatedProfit),
    estimatedMargin,
    estimatedTravelMinutes,
    estimatedOnSiteHours,
    estimatedVolumePct,
    numberOfDumpLoads: numberOfDumpLoads || 1,
    loadSize: loadSize || 'Half truck/trailer',
    accessType: accessType || 'Curbside / already outside',
    addOns,
    breakdown,
    quoteResult,
    hasHeavyItems,
    hasDifficultItems,
    hasAppliances,
    hasMattress,
    hasDistanceData,
    estimatedDirectCost: Math.round(estimatedDirectCost),
    laborAllowance,
    disposalAllowance,
    estimatedFuelCost,
    wasMinimumApplied,
    marginAdjustment,
    missingInputs,
    weightRisk,
    weightRiskReason,
    targetMargin,
  };
}
