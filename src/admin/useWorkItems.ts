import { useState, useEffect, useCallback } from 'react';
import type { WorkItem } from './types';
import { workItems as seedWorkItems } from './types';

export function useWorkItems() {
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setWorkItems(seedWorkItems);
    } catch (err: any) {
      setError(err.message || 'Failed to load work items');
      setWorkItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { workItems, loading, error, refresh };
}
