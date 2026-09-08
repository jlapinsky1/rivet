/**
 * Risk flag severity levels:
 *   'info'    — Informational, no action needed
 *   'warning' — Warrants closer review
 *   'blocker' — Must be resolved or overridden before approval/acceptance
 */

const DIFFICULT_ITEM_KEYWORDS = [
  'sleeper sofa', 'sofa bed', 'hide-a-bed',
  'safe', 'gun safe',
  'piano', 'upright piano', 'grand piano', 'organ',
  'hot tub', 'spa', 'jacuzzi',
  'pool table', 'billiard',
  'cast iron',
];

const HEAVY_ITEM_KEYWORDS = [
  'refrigerator', 'fridge',
  'washer', 'dryer',
  'dishwasher',
  'oven', 'stove', 'range',
  'water heater',
  'treadmill', 'elliptical', 'weight bench',
  ...DIFFICULT_ITEM_KEYWORDS,
];

const HAZMAT_KEYWORDS = [
  'paint', 'chemical', 'solvent', 'asbestos', 'lead',
  'oil', 'gas', 'gasoline', 'propane', 'tank',
  'battery', 'batteries', 'acid',
  'pesticide', 'herbicide', 'fertilizer',
  'medical', 'needle', 'sharps', 'biohazard',
  'fluorescent', 'mercury', 'cfl',
];

const CONSTRUCTION_KEYWORDS = [
  'drywall', 'sheetrock', 'concrete', 'brick', 'cinder block',
  'demolition', 'demo', 'renovation', 'remodel',
  'roofing', 'shingles', 'siding',
  'tile', 'flooring', 'carpet padding',
  'lumber', 'plywood', 'framing',
];

const HIDDEN_ITEM_PHRASES = [
  'more stuff', 'other things', 'some more',
  'not pictured', 'didn\'t photo', 'couldn\'t fit',
  'also have', 'plus', 'and more',
  'not shown', 'in the back', 'behind',
  'upstairs too', 'downstairs too',
  'another room', 'other room', 'rest of',
  'garage too', 'attic', 'crawl space',
];

/**
 * Detect risk flags from a booking and its estimate.
 * Returns an array of { flag, severity, message }.
 */
export function detectRiskFlags(booking, estimate) {
  const flags = [];

  // --- Photo quality ---
  if ((booking.photoCount || 0) === 0) {
    flags.push({ flag: 'no_photos', severity: 'warning', message: 'No photos provided — estimate based on description only' });
  } else if ((booking.photoCount || 0) < 3) {
    flags.push({ flag: 'low_photos', severity: 'warning', message: `Only ${booking.photoCount || 0} photo(s) uploaded (minimum 3 recommended)` });
  }

  // --- Item mismatch ---
  if (booking.detectedItems && booking.aiDetectedItems) {
    const aiCount = booking.aiDetectedItems.length;
    const finalCount = booking.detectedItems.length;
    if (finalCount < aiCount - 1) {
      flags.push({ flag: 'items_removed', severity: 'warning', message: `Customer removed ${aiCount - finalCount} AI-detected item(s) — verify accuracy` });
    }
    if (finalCount > aiCount + 2) {
      flags.push({ flag: 'items_added', severity: 'warning', message: `Customer added ${finalCount - aiCount} item(s) beyond AI detection — may indicate more unseen items` });
    }
  }

  const allItemNames = (booking.detectedItems || []).map(i => i.item.toLowerCase());
  const description = (booking.description || '').toLowerCase();
  const allText = [...allItemNames, description].join(' ');

  // --- Heavy or oversized items ---
  const foundHeavy = HEAVY_ITEM_KEYWORDS.filter(k => allText.includes(k));
  if (foundHeavy.length > 0) {
    flags.push({ flag: 'heavy_items', severity: 'warning', message: `Heavy items: ${[...new Set(foundHeavy)].join(', ')}` });
  }

  // --- Difficult items ---
  const foundDifficult = DIFFICULT_ITEM_KEYWORDS.filter(k => allText.includes(k));
  if (foundDifficult.length > 0) {
    flags.push({ flag: 'difficult_items', severity: 'warning', message: `Difficult items: ${[...new Set(foundDifficult)].join(', ')} — extra labor/equipment may be needed` });
  }

  // --- Stairs ---
  if (booking.stairs === 'one_flight') {
    flags.push({ flag: 'stairs', severity: 'info', message: 'One flight of stairs' });
  } else if (booking.stairs === 'multiple') {
    flags.push({ flag: 'stairs_multiple', severity: 'warning', message: 'Multiple flights of stairs — significant extra labor' });
  }

  // --- Indoor pickup ---
  if (['first_floor', 'upstairs', 'basement'].includes(booking.accessType)) {
    flags.push({ flag: 'indoor_pickup', severity: 'info', message: 'Indoor pickup — longer load time expected' });
  }

  // --- No elevator on upper/lower floor ---
  if ((booking.accessType === 'upstairs' || booking.accessType === 'basement') && booking.elevator === 'no') {
    flags.push({ flag: 'no_elevator', severity: 'warning', message: 'Upper floor / basement without elevator' });
  }

  // --- Construction debris ---
  const foundConstruction = CONSTRUCTION_KEYWORDS.filter(k => allText.includes(k));
  if (foundConstruction.length > 0) {
    flags.push({ flag: 'construction_debris', severity: 'warning', message: `Construction/demo debris: ${[...new Set(foundConstruction)].join(', ')} — heavier, special disposal may apply` });
  }

  // --- BLOCKER: Hazardous materials ---
  const foundHazmat = HAZMAT_KEYWORDS.filter(k => allText.includes(k));
  if (foundHazmat.length > 0) {
    flags.push({ flag: 'hazmat_possible', severity: 'blocker', message: `Possible prohibited/hazardous materials: ${[...new Set(foundHazmat)].join(', ')}` });
  }

  // --- Long travel ---
  if (estimate && estimate.estimatedTravelMinutes > 90) {
    flags.push({ flag: 'long_travel', severity: 'warning', message: `Estimated ${estimate.estimatedTravelMinutes} min travel time` });
  }

  // --- Unclear quantity ---
  if (!booking.quantity) {
    flags.push({ flag: 'no_quantity', severity: 'warning', message: 'Customer did not specify quantity' });
  }
  if (booking.quantity === 'Whole house / cleanout') {
    flags.push({ flag: 'large_job', severity: 'warning', message: 'Whole house cleanout — consider on-site estimate' });
  }

  // --- Hidden items in description ---
  const foundHidden = HIDDEN_ITEM_PHRASES.filter(p => description.includes(p));
  if (foundHidden.length > 0) {
    flags.push({ flag: 'hidden_items', severity: 'warning', message: 'Customer description suggests additional items not in photos' });
  }

  // --- No item info at all (and no photos to compensate) ---
  if ((!booking.detectedItems || booking.detectedItems.length === 0) && !booking.description && (booking.photoCount || 0) === 0) {
    flags.push({ flag: 'no_item_info', severity: 'warning', message: 'No item list, description, or photos — contact customer for details' });
  }

  // --- Weight risk from estimate ---
  if (estimate?.weightRisk) {
    flags.push({ flag: 'weight_risk', severity: 'warning', message: estimate.weightRiskReason || 'Possible payload/weight risk' });
  }

  // --- BLOCKER: Critical missing pricing inputs ---
  if (estimate?.missingInputs) {
    const financialMissing = estimate.missingInputs.filter(m => m.financial);
    if (financialMissing.length >= 3) {
      flags.push({
        flag: 'critical_missing_inputs',
        severity: 'blocker',
        message: `${financialMissing.length} pricing inputs missing — estimate unreliable`,
      });
    } else if (financialMissing.length > 0) {
      for (const m of financialMissing) {
        flags.push({ flag: `missing_${m.field}`, severity: 'warning', message: m.message });
      }
    }
  }

  return flags;
}

/**
 * Check price-specific risk flags when admin sets a price.
 */
export function checkPriceFlags(adminPrice, estimate, settings) {
  const flags = [];
  const price = Number(adminPrice);

  if (!price || price <= 0) {
    flags.push({ flag: 'no_price', severity: 'blocker', message: 'No price entered' });
    return flags;
  }

  if (estimate) {
    const margin = (price - estimate.estimatedDirectCost) / price;
    if (margin < 0.50) {
      flags.push({ flag: 'very_low_margin', severity: 'blocker', message: `Price yields only ${(margin * 100).toFixed(0)}% margin — below safe threshold (50%)` });
    } else if (margin < 0.60) {
      flags.push({ flag: 'low_margin', severity: 'warning', message: `Price yields ${(margin * 100).toFixed(0)}% margin (target: 70%+)` });
    } else if (margin < 0.70) {
      flags.push({ flag: 'below_target_margin', severity: 'info', message: `Price yields ${(margin * 100).toFixed(0)}% margin (target: 70%)` });
    }

    if (price < estimate.recommendedPrice) {
      flags.push({ flag: 'below_recommended', severity: 'warning', message: `$${price} is below recommended $${estimate.recommendedPrice}` });
    }
  }

  if (settings && price < settings.minimumPrice) {
    flags.push({ flag: 'below_minimum', severity: 'blocker', message: `$${price} is below minimum ($${settings.minimumPrice})` });
  }

  return flags;
}

/**
 * Check acceptance-time blockers (expired quote, unavailable slot).
 */
export function checkAcceptanceBlockers(booking, selectedSlot, bookedSlots) {
  const flags = [];

  if (booking.quoteExpiresAt && new Date(booking.quoteExpiresAt) < new Date()) {
    flags.push({ flag: 'quote_expired', severity: 'blocker', message: 'This quote has expired' });
  }

  if (selectedSlot && bookedSlots && bookedSlots.includes(selectedSlot)) {
    flags.push({ flag: 'slot_unavailable', severity: 'blocker', message: 'Selected time slot is no longer available' });
  }

  if (booking.availableSlots?.length > 0 && !selectedSlot) {
    flags.push({ flag: 'no_slot_selected', severity: 'blocker', message: 'Please select a pickup time' });
  }

  return flags;
}

/**
 * Calculate quote confidence from booking data and flags.
 */
export function calculateConfidence(booking, flags) {
  let score = 100;
  const reasons = [];

  for (const f of flags) {
    if (f.severity === 'blocker') { score -= 25; reasons.push(f.message); }
    else if (f.severity === 'warning') { score -= 10; reasons.push(f.message); }
    else if (f.severity === 'info') { score -= 3; }
  }

  // Zero photos penalty (stronger than per-warning deduction — intentionally degrades confidence)
  if ((booking.photoCount || 0) === 0) {
    score -= 15;
  } else if ((booking.photoCount || 0) >= 6) {
    score += 5;
  }
  if (booking.detectedItems?.length > 0) score += 5;
  if (booking.description?.trim().length > 20) score += 5;

  score = Math.max(0, Math.min(100, score));

  let level;
  if (score >= 75) level = 'high';
  else if (score >= 50) level = 'medium';
  else level = 'low';

  return { level, score, reasons: reasons.slice(0, 6) };
}

/**
 * Returns true if the flags array contains any blockers.
 */
export function hasBlockers(flags) {
  return flags.some(f => f.severity === 'blocker');
}

export const SEVERITY_COLORS = {
  info: 'text-blue-700 bg-blue-50 border-blue-200',
  warning: 'text-amber-700 bg-amber-50 border-amber-200',
  blocker: 'text-red-700 bg-red-50 border-red-200',
};

export const SEVERITY_ICONS = {
  info: 'i',
  warning: '!',
  blocker: 'X',
};
