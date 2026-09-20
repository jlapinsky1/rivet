import { useEffect, useMemo, useState } from 'react';
import type { WorkItem } from './types';
import type { EstimationRun } from '../estimator/types';
import { getRunsForBusiness } from '../estimator/persistence';
import { applyLiveRecommendations } from '../estimator/applyLiveRecommendations';

export { applyLiveRecommendations } from '../estimator/applyLiveRecommendations';

export function useLiveRecommendations(
  items: WorkItem[],
  loading: boolean,
  settings: Record<string, unknown> | undefined,
  businessId: string | undefined,
): WorkItem[] {
  const [runs, setRuns] = useState<EstimationRun[]>([]);

  useEffect(() => {
    if (!businessId) {
      setRuns([]);
      return;
    }
    let cancelled = false;
    getRunsForBusiness(businessId).then((data) => {
      if (!cancelled) setRuns(data);
    }).catch(() => {
      if (!cancelled) setRuns([]);
    });
    return () => { cancelled = true; };
  }, [businessId, items.length]);

  return useMemo(() => {
    if (loading || !businessId) return items;
    return applyLiveRecommendations(items, runs, settings, businessId);
  }, [items, runs, settings, businessId, loading]);
}
