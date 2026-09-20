import { describe, it, expect } from 'vitest';
import { isRecDisagreement, priceMoveReason, recReasonPrompt } from '../decisionFeedback';

describe('priceMoveReason', () => {
  it('tags a lower price as system too high', () => {
    expect(priceMoveReason(200, 190)).toBe('SYSTEM_TOO_HIGH');
  });

  it('tags a higher price as system too low', () => {
    expect(priceMoveReason(200, 210)).toBe('SYSTEM_TOO_LOW');
  });

  it('returns null when the price did not move', () => {
    expect(priceMoveReason(200, 200)).toBeNull();
  });
});

describe('recReasonPrompt', () => {
  it('does not ask when they send a Send job or decline a Pass', () => {
    expect(recReasonPrompt('take', 'approve')).toBeNull();
    expect(recReasonPrompt('take_at_price', 'approve')).toBeNull();
    expect(recReasonPrompt('pass', 'decline')).toBeNull();
  });

  it('asks why they take a Pass', () => {
    const prompt = recReasonPrompt('pass', 'approve');
    expect(prompt?.options.map(o => o.code)).toContain('REC_OVERRIDE_PASS');
  });

  it('asks why they decline a Send', () => {
    const prompt = recReasonPrompt('take', 'decline');
    expect(prompt?.options.map(o => o.code)).toEqual([
      'REC_SHOULD_HAVE_PASSED',
      'REC_DONT_WANT_CUSTOMER',
      'OTHER',
    ]);
  });

  it('asks what happened after Look first', () => {
    const accept = recReasonPrompt('review', 'approve');
    expect(accept?.options.map(o => o.code)).toContain('REC_LOOK_FIRST_CLEAR');
    expect(accept?.options.map(o => o.code)).toContain('REC_SHOULD_HAVE_SENT');
    expect(recReasonPrompt('review', 'decline')?.options.map(o => o.code)).toContain('REC_SHOULD_HAVE_PASSED');
  });
});

describe('isRecDisagreement', () => {
  it('flags Pass they took and Send they declined', () => {
    expect(isRecDisagreement('pass', 'approved')).toBe(true);
    expect(isRecDisagreement('pass', 'declined')).toBe(false);
    expect(isRecDisagreement('take', 'declined')).toBe(true);
    expect(isRecDisagreement('take', 'approved')).toBe(false);
  });

  it('treats any close on Look first as a call to grade', () => {
    expect(isRecDisagreement('review', 'approved')).toBe(true);
    expect(isRecDisagreement('review', 'declined')).toBe(true);
  });
});
