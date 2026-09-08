import { createContext, useContext } from 'react';
import type { WorkItem } from './types';
import { useWorkItems } from './useWorkItems';

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
  const value = useWorkItems();
  return (
    <WorkItemsContext.Provider value={value}>
      {children}
    </WorkItemsContext.Provider>
  );
}

export function useWorkItemsContext() {
  return useContext(WorkItemsContext);
}
