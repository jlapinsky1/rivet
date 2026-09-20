import { describe, it, expect } from 'vitest';
import { truckHeadline, truckSentence } from '../truckCopy';

describe('truck copy', () => {
  it('Send is the ask; walk-away is the counter', () => {
    expect(truckHeadline('take_at_price', 185, 240)).toBe('Send $240');
    expect(truckSentence('take_at_price', 185, 240, null, 175)).toBe(
      'Send $240. If they push back, $175 is as low as you can go.',
    );
  });

  it('does not invent a counter when ask already is the floor', () => {
    expect(truckSentence('take', 175, undefined, null, 175)).toBe('Send $175.');
  });

  it('Look first names the thing', () => {
    expect(truckHeadline('review', 185, undefined, 'How far the water went')).toBe(
      'Look first: How far the water went',
    );
  });
});
