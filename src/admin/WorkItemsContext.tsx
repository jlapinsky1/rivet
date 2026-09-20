import { createContext, useContext } from 'react';
import type { WorkItem } from './types';
import { useWorkItems } from './useWorkItems';
import { useSettings } from './useSettings';
import { useAuth } from '../lib/AuthProvider';
import { useLiveRecommendations } from './useLiveRecommendations';

type WorkItemsContextValue = {
  workItems: WorkItem[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const WorkItemsContext = createContext<WorkItemsContextValue>({
  workItems: [],
  loading: true,
  error: null,
  refresh: async () => {},
});

export function WorkItemsProvider({ children }: { children: React.ReactNode }) {
  const raw = useWorkItems();
  const { settings } = useSettings();
  const { business } = useAuth();
  const workItems = useLiveRecommendations(
    raw.workItems,
    raw.loading,
    settings,
    business?.businessId,
  );

  return (
    <WorkItemsContext.Provider value={{
      workItems,
      loading: raw.loading,
      error: raw.error,
      refresh: raw.refresh,
    }}>
      {children}
    </WorkItemsContext.Provider>
  );
}

export function useWorkItemsContext() {
  return useContext(WorkItemsContext);
}
