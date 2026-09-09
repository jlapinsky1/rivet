import { useState, useEffect, useCallback } from 'react';
import type { WorkItem } from '../admin/types';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthProvider';

function mapRow(row: Record<string, unknown>): WorkItem {
  return {
    id: row.id as number,
    title: row.title as string,
    source: row.source as WorkItem['source'],
    customerType: row.customer_type as WorkItem['customerType'],
    customerName: row.customer_name as string,
    customerSub: (row.customer_sub as string) ?? undefined,
    location: row.location as string,
    travel: row.travel as string,
    profit: row.profit as number,
    hours: row.hours as string,
    hoursNum: row.hours_num as number,
    rate: row.rate as string,
    rateNum: row.rate_num as number,
    recommendation: row.recommendation as WorkItem['recommendation'],
    confidence: row.confidence as number,
    description: row.description as string,
    price: row.price as number,
    costs: row.costs as number,
    costBreakdown: (row.cost_breakdown as WorkItem['costBreakdown']) ?? [],
    reasons: (row.reasons as WorkItem['reasons']) ?? [],
    photos: (row.photos as string[]) ?? [],
    opStatus: row.op_status as WorkItem['opStatus'],
    billingStatus: row.billing_status as WorkItem['billingStatus'],
    preferredDate: (row.preferred_date as string) ?? undefined,
    phone: (row.phone as string) ?? undefined,
    email: (row.email as string) ?? undefined,
    address: (row.address as string) ?? undefined,
    customerNotes: (row.customer_notes as string) ?? undefined,
    companyName: (row.company_name as string) ?? undefined,
    propertyName: (row.property_name as string) ?? undefined,
    unitLabel: (row.unit_label as string) ?? undefined,
    workOrderNumber: (row.work_order_number as string) ?? undefined,
    requestedBy: (row.requested_by as string) ?? undefined,
    requestedByRole: (row.requested_by_role as string) ?? undefined,
    requestedDate: (row.requested_date as string) ?? undefined,
    scope: (row.scope as string) ?? undefined,
    serviceType: row.service_type as string,
    estimationRunId: (row.estimation_run_id as string) ?? undefined,
  };
}

export function useWorkItems() {
  const { business } = useAuth();
  const [workItems, setWorkItems] = useState<WorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!business) {
      setWorkItems([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('work_items')
        .select('*')
        .eq('business_id', business.businessId)
        .order('created_at', { ascending: false });

      if (fetchError) throw new Error(fetchError.message);
      setWorkItems((data ?? []).map(mapRow));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load work items';
      setError(msg);
      setWorkItems([]);
    } finally {
      setLoading(false);
    }
  }, [business]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { workItems, loading, error, refresh };
}
