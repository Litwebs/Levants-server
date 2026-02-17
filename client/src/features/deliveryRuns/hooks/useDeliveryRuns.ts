// Hook for Delivery Runs list page
import { useState, useEffect, useCallback } from 'react';
import { DeliveryRunListItem, ListRunsParams } from '../types';
import { listRuns, createRun } from '../api/deliveryRunsApi';

interface UseDeliveryRunsState {
  runs: DeliveryRunListItem[];
  loading: boolean;
  error: string | null;
  creating: boolean;
}

type CreateRunResult = { success: true } | { success: false; message?: string };

export function useDeliveryRuns(initialParams?: ListRunsParams) {
  const [state, setState] = useState<UseDeliveryRunsState>({
    runs: [],
    loading: true,
    error: null,
    creating: false
  });
  const [params, setParams] = useState<ListRunsParams>(initialParams || {});

  const fetchRuns = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await listRuns(params);
      setState(s => ({ ...s, runs: data, loading: false }));
    } catch (err) {
      setState(s => ({ 
        ...s, 
        loading: false, 
        error: err instanceof Error ? err.message : 'Failed to load runs' 
      }));
    }
  }, [params]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);

  const updateFilters = useCallback((newParams: Partial<ListRunsParams>) => {
    setParams(p => ({ ...p, ...newParams }));
  }, []);

  const handleCreateRun = useCallback(async (deliveryDate: string, orderIds?: string[]): Promise<CreateRunResult> => {
    setState(s => ({ ...s, creating: true }));
    try {
      await createRun({ deliveryDate, orderIds });
      await fetchRuns();
      setState(s => ({ ...s, creating: false }));
      return { success: true };
    } catch (err) {
      setState(s => ({ ...s, creating: false }));
      const message = err instanceof Error ? err.message : 'Failed to create run';
      return { success: false, message };
    }
  }, [fetchRuns]);

  const refetch = useCallback(() => {
    fetchRuns();
  }, [fetchRuns]);

  return {
    ...state,
    params,
    updateFilters,
    createRun: handleCreateRun,
    refetch
  };
}
