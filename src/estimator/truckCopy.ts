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

/** One line for the truck: Send $X, Pass, or Look first: {thing}. */
export function truckHeadline(
  rec: Recommendation,
  quote: number,
  suggestedPrice?: number,
  lookFirst?: string | null,
): string {
  if (rec === 'pass') return 'Pass';
  if (rec === 'review') {
    return lookFirst ? `Look first: ${lookFirst}` : 'Look first';
  }
  const send = truckSendPrice(rec, quote, suggestedPrice);
  return send != null ? `Send $${send}` : 'Send';
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
    const look = lookFirst
      ? `Don't send a number until you check: ${lookFirst}.`
      : 'Look at the job before you send a number.';
    return walkAwayPrice ? `${look} Don't go below $${walkAwayPrice}.` : look;
  }
  const send = truckSendPrice(rec, quote, suggestedPrice);
  if (send == null) return 'Send the quote.';
  if (walkAwayPrice != null && walkAwayPrice < send) {
    return `Send $${send}. If they push back, $${walkAwayPrice} is as low as you can go.`;
  }
  return `Send $${send}.`;
}
