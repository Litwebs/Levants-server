// Hook for single Delivery Run details page
import { useState, useEffect, useCallback } from 'react';
import { DeliveryRun } from '../types';
import { getRun, lockRun, unlockRun, optimizeRun, dispatchRun } from '../api/deliveryRunsApi';

interface UseDeliveryRunState {
  run: DeliveryRun | null;
  loading: boolean;
  error: string | null;
  actionLoading: 'lock' | 'unlock' | 'optimize' | 'dispatch' | null;
}

export function useDeliveryRun(id: string) {
  const [state, setState] = useState<UseDeliveryRunState>({
    run: null,
    loading: true,
    error: null,
    actionLoading: null
  });

  const fetchRun = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await getRun(id);
      if (data) {
        setState(s => ({ ...s, run: data, loading: false }));
      } else {
        setState(s => ({ ...s, loading: false, error: 'Run not found' }));
      }
    } catch (err) {
      setState(s => ({ 
        ...s, 
        loading: false, 
        error: err instanceof Error ? err.message : 'Failed to load run' 
      }));
    }
  }, [id]);

  useEffect(() => {
    fetchRun();
  }, [fetchRun]);

  const handleLock = useCallback(async () => {
    setState(s => ({ ...s, actionLoading: 'lock' }));
    try {
      const updated = await lockRun(id);
      if (updated) {
        setState(s => ({ ...s, run: updated, actionLoading: null }));
        return true;
      }
      setState(s => ({ ...s, actionLoading: null }));
      return false;
    } catch (err) {
      setState(s => ({ ...s, actionLoading: null }));
      throw err;
    }
  }, [id]);

  const handleUnlock = useCallback(async () => {
    setState(s => ({ ...s, actionLoading: 'unlock' }));
    try {
      const updated = await unlockRun(id);
      if (updated) {
        setState(s => ({ ...s, run: updated, actionLoading: null }));
        return true;
      }
      setState(s => ({ ...s, actionLoading: null }));
      return false;
    } catch (err) {
      setState(s => ({ ...s, actionLoading: null }));
      throw err;
    }
  }, [id]);

  const handleOptimize = useCallback(async (driverIds: string[]) => {
    setState(s => ({ ...s, actionLoading: 'optimize' }));
    try {
      const updated = await optimizeRun(id, driverIds);
      if (updated) {
        setState(s => ({ ...s, run: updated, actionLoading: null }));
        return true;
      }
      setState(s => ({ ...s, actionLoading: null }));
      return false;
    } catch (err) {
      setState(s => ({ ...s, actionLoading: null }));
      throw err;
    }
  }, [id]);

  const handleDispatch = useCallback(async () => {
    setState(s => ({ ...s, actionLoading: 'dispatch' }));
    try {
      const updated = await dispatchRun(id);
      if (updated) {
        setState(s => ({ ...s, run: updated, actionLoading: null }));
        return true;
      }
      setState(s => ({ ...s, actionLoading: null }));
      return false;
    } catch (err) {
      setState(s => ({ ...s, actionLoading: null }));
      throw err;
    }
  }, [id]);

  return {
    ...state,
    refetch: fetchRun,
    lock: handleLock,
    unlock: handleUnlock,
    optimize: handleOptimize,
    dispatch: handleDispatch
  };
}
