import { useState, useEffect } from 'react';

export interface ScopeAdvice {
  questions: string[];
  context: string;
}

interface UseJobAdvisorOptions {
  /** Only fires the agent call when true. Set to false to skip (non-review jobs). */
  enabled: boolean;
  businessId: string;
  jobTitle: string;
  customerDescription?: string;
  customerNotes?: string;
  photoCount: number;
  lookFirst?: string;
}

/**
 * Calls the Job Advisor agent to generate specific clarifying questions for a review job.
 * Uses Haiku → cheap, fast (~500ms). Falls back gracefully on error.
 */
export function useJobAdvisor({
  enabled,
  businessId,
  jobTitle,
  customerDescription,
  customerNotes,
  photoCount,
  lookFirst,
}: UseJobAdvisorOptions) {
  const [advice, setAdvice] = useState<ScopeAdvice | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !businessId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setAdvice(null);

    fetch('/.netlify/functions/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: 'clarify-scope',
        businessId,
        jobTitle,
        customerDescription,
        customerNotes,
        photoCount,
        lookFirst,
      }),
    })
      .then(async r => {
        if (!r.ok) throw new Error(`Agent ${r.status}`);
        return r.json() as Promise<ScopeAdvice>;
      })
      .then(data => {
        if (!cancelled) setAdvice(data);
      })
      .catch(err => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]); // Fire once when the drawer opens for a review job

  return { advice, loading, error };
}
