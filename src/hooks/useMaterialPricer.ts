import { useState } from 'react';
import type { MaterialsBom } from '../admin/types';

const AGENTS_URL = import.meta.env.VITE_AGENTS_URL ?? 'https://rivet-agents.onrender.com';

export function useMaterialPricer(businessId: string) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function priceMaterials(workItemId: number): Promise<MaterialsBom | null> {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${AGENTS_URL}/agent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'price-materials', businessId, workItemId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to price materials');
      return data.bom as MaterialsBom;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to price materials';
      setError(msg);
      return null;
    } finally {
      setLoading(false);
    }
  }

  return { priceMaterials, loading, error };
}
