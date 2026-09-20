import type { OwnerAction, ReasonCode, Recommendation } from './types';

export type RecReasonOption = { code: ReasonCode; label: string };

export type RecReasonPrompt = {
  title: string;
  options: RecReasonOption[];
};

/** Direction of a price edit vs Rivet's number. Null if unchanged. */
export function priceMoveReason(systemPrice: number, newPrice: number): ReasonCode | null {
  if (!Number.isFinite(systemPrice) || !Number.isFinite(newPrice)) return null;
  if (newPrice === systemPrice) return null;
  return newPrice < systemPrice ? 'SYSTEM_TOO_HIGH' : 'SYSTEM_TOO_LOW';
}

/**
 * When the owner action disagrees with the truck rec, we must ask why.
 * Agree cases (Send + quote, Pass + decline) return null.
 */
export function recReasonPrompt(
  rec: Recommendation,
  intent: 'approve' | 'decline',
): RecReasonPrompt | null {
  if (intent === 'decline') {
    if (rec === 'pass') return null;
    return {
      title: rec === 'review' ? 'Why pass after we said look first?' : 'Why decline? We said send it.',
      options: [
        { code: 'REC_SHOULD_HAVE_PASSED', label: 'This should have been a Pass' },
        { code: 'REC_DONT_WANT_CUSTOMER', label: "I don't want this customer" },
        { code: 'OTHER', label: 'Other' },
      ],
    };
  }

  if (rec === 'pass') {
    return {
      title: 'We said Pass. Why take it?',
      options: [
        { code: 'REC_OVERRIDE_PASS', label: 'Wrong call — I can take this' },
        { code: 'OWNER_EXPERIENCE', label: 'My experience says this is fine' },
        { code: 'OTHER', label: 'Other' },
      ],
    };
  }

  if (rec === 'review') {
    return {
      title: 'We said look first. What did you decide?',
      options: [
        { code: 'REC_LOOK_FIRST_CLEAR', label: 'Looked — nothing to worry about' },
        { code: 'REC_SHOULD_HAVE_SENT', label: 'You should have just sent it' },
        { code: 'OTHER', label: 'Other' },
      ],
    };
  }

  return null;
}

export function isRecDisagreement(rec: Recommendation, action: OwnerAction): boolean {
  if (action === 'reviewed_later') return false;
  if (rec === 'pass') return action === 'approved' || action === 'approved_adjusted';
  if (rec === 'take' || rec === 'take_at_price') return action === 'declined';
  if (rec === 'review') {
    return action === 'approved' || action === 'approved_adjusted' || action === 'declined';
  }
  return false;
}
