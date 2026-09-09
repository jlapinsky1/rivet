import { useState, useEffect, useCallback } from 'react';
import type { IndividualCustomer, Company, Property } from '../admin/types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthProvider';

export function useCustomers() {
  const { business } = useAuth();
  const [individuals, setIndividuals] = useState<IndividualCustomer[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!business) {
      setIndividuals([]);
      setCompanies([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const [custResult, compResult] = await Promise.all([
        supabase
          .from('customers')
          .select('*')
          .eq('business_id', business.businessId)
          .order('name'),
        supabase
          .from('companies')
          .select('*, properties(*)')
          .eq('business_id', business.businessId)
          .order('name'),
      ]);

      if (custResult.error) throw new Error(custResult.error.message);
      if (compResult.error) throw new Error(compResult.error.message);

      setIndividuals(
        (custResult.data ?? []).map((r) => ({
          id: r.id as number,
          name: r.name as string,
          phone: r.phone as string,
          email: r.email as string,
          address: r.address as string,
          jobCount: r.job_count as number,
          totalRevenue: r.total_revenue as number,
        })),
      );

      setCompanies(
        (compResult.data ?? []).map((r) => ({
          id: r.id as number,
          name: r.name as string,
          contactName: r.contact_name as string,
          contactRole: r.contact_role as string,
          phone: r.phone as string,
          email: r.email as string,
          totalRevenue: r.total_revenue as number,
          properties: ((r.properties as unknown[]) ?? []).map((p: unknown) => {
            const prop = p as Record<string, unknown>;
            return {
              id: prop.id as number,
              name: prop.name as string,
              address: prop.address as string,
              unitCount: prop.unit_count as number,
              workOrderCount: prop.work_order_count as number,
              units: (prop.units as string[]) ?? [],
            } as Property;
          }),
        })),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load customers';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [business]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { individuals, companies, loading, error, refresh };
}
