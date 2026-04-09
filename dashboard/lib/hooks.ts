'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchHealth,
  fetchLeads,
  fetchCrew,
  fetchCosts,
  fetchWorkflows,
  fetchActiveTasks,
  fetchAppointments,
  type HealthData,
  type Lead,
  type CostData,
  type Task,
  type Appointment,
  type LeadFilters,
} from './api';

interface HookResult<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
  refetch: () => void;
}

function usePolling<T>(
  fetcher: () => Promise<T | null>,
  intervalMs: number
): HookResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);

  const doFetch = useCallback(async () => {
    try {
      const result = await fetcher();
      if (!mountedRef.current) return;
      if (result !== null) {
        setData(result);
        setError(false);
      } else {
        setError(true);
      }
    } catch {
      if (mountedRef.current) setError(true);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [fetcher]);

  useEffect(() => {
    mountedRef.current = true;
    doFetch();
    const id = setInterval(doFetch, intervalMs);
    return () => {
      mountedRef.current = false;
      clearInterval(id);
    };
  }, [doFetch, intervalMs]);

  return { data, loading, error, refetch: doFetch };
}

export function useHealth(): HookResult<HealthData> {
  return usePolling(fetchHealth, 10_000);
}

export function useLeads(filters?: LeadFilters): HookResult<Lead[]> {
  const fetcher = useCallback(() => fetchLeads(filters), [filters]);
  return usePolling(fetcher, 30_000);
}

// Crew returns { workers, jobs, recentJobs, costs, runningNow }
export function useCrew(): HookResult<Record<string, unknown>> {
  return usePolling(fetchCrew, 15_000);
}

export function useCosts(): HookResult<CostData> {
  return usePolling(fetchCosts, 60_000);
}

// Workflows returns { templates: [...] }
export function useWorkflows(): HookResult<Record<string, unknown>> {
  return usePolling(fetchWorkflows, 20_000);
}

export function useActiveTasks(): HookResult<Task[]> {
  return usePolling(fetchActiveTasks, 5_000);
}

export function useAppointments(): HookResult<Appointment[]> {
  return usePolling(fetchAppointments, 30_000);
}
