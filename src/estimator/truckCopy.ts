import type { Recommendation } from './types';

/** Price the tech should send first, or null when the action is not Send. */
export function truckSendPrice(
  rec: Recommendation,
  quote: number,
  suggestedPrice?: number,
): number | null {
  if (rec === 'pass' || rec === 'review') return null;
  if (rec === 'take_at_price' && suggestedPrice != null) return Math.round(suggestedPrice);
  return Math.round(quote);
}

/** One line for the truck: Send $X, Pass, or Need more info. */
export function truckHeadline(
  rec: Recommendation,
  quote: number,
  suggestedPrice?: number,
  _lookFirst?: string | null,
): string {
  if (rec === 'pass') return 'Pass';
  if (rec === 'review') return 'Need more info';
  const send = truckSendPrice(rec, quote, suggestedPrice);
  return send != null ? `Quote $${send}` : 'Quote';
}

export function truckSentence(
  rec: Recommendation,
  quote: number,
  suggestedPrice?: number,
  lookFirst?: string | null,
  walkAwayPrice?: number | null,
): string {
  if (rec === 'pass') {
    return walkAwayPrice
      ? `Skip this one this week. If you take it anyway, don't go below $${walkAwayPrice}.`
      : 'Skip this one this week.';
  }
  if (rec === 'review') {
    return lookFirst
      ? `Reach out to the customer to find out ${lookFirst} before quoting.`
      : 'Get more details from the customer before quoting.';
  }
  const send = truckSendPrice(rec, quote, suggestedPrice);
  if (send == null) return 'Quote this job.';
  if (walkAwayPrice != null && walkAwayPrice < send) {
    return `Quote $${send}. If they push back, $${walkAwayPrice} is as low as you can go.`;
  }
  return `Quote $${send}.`;
}
