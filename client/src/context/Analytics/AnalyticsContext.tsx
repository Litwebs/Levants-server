import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import api from "../api";

import AnalyticsReducer, {
  ANALYTICS_DASHBOARD_SUCCESS,
  ANALYTICS_FAILURE,
  ANALYTICS_REQUEST,
  ANALYTICS_REVENUE_OVERVIEW_FAILURE,
  ANALYTICS_REVENUE_OVERVIEW_REQUEST,
  ANALYTICS_REVENUE_OVERVIEW_SUCCESS,
  ANALYTICS_SET_FILTERS,
} from "./AnalyticsReducer";

import {
  type AnalyticsDashboard,
  type AnalyticsDateRange,
  type AnalyticsState,
  type RevenueOverview,
  type RevenueInterval,
  initialAnalyticsState,
} from "./constants";

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  message?: string;
  meta?: unknown;
};

const unwrapData = <T,>(payload: unknown): T | null => {
  if (!payload || typeof payload !== "object") return null;
  const maybeEnvelope = payload as ApiEnvelope<T>;
  if ("data" in maybeEnvelope) return (maybeEnvelope.data ?? null) as T | null;
  return payload as T;
};

type AnalyticsContextType = {
  dashboard: AnalyticsState["dashboard"];

  revenueOverview: AnalyticsState["revenueOverview"];
  revenueOverviewLoading: AnalyticsState["revenueOverviewLoading"];
  revenueOverviewError: AnalyticsState["revenueOverviewError"];

  range: AnalyticsState["range"];
  from: AnalyticsState["from"];
  to: AnalyticsState["to"];
  interval: AnalyticsState["interval"];

  loading: AnalyticsState["loading"];
  error: AnalyticsState["error"];

  setFilters: (filters: {
    range: AnalyticsDateRange;
    from?: string;
    to?: string;
    interval?: RevenueInterval;
  }) => void;

  getDashboard: (params?: {
    range?: AnalyticsDateRange;
    from?: string;
    to?: string;
    interval?: RevenueInterval;
  }) => Promise<AnalyticsDashboard>;

  getRevenueOverview: (params?: { days?: number }) => Promise<RevenueOverview>;
};

const AnalyticsContext = createContext<AnalyticsContextType | null>(null);

export const AnalyticsProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(AnalyticsReducer, initialAnalyticsState);

  const setFilters = useCallback(
    (filters: {
      range: AnalyticsDateRange;
      from?: string;
      to?: string;
      interval?: RevenueInterval;
    }) => {
      dispatch({
        type: ANALYTICS_SET_FILTERS,
        payload: {
          range: filters.range,
          from: filters.from ?? "",
          to: filters.to ?? "",
          interval: filters.interval ?? state.interval,
        },
      });
    },
    [state.interval],
  );

  const getDashboard = useCallback(
    async (params?: {
      range?: AnalyticsDateRange;
      from?: string;
      to?: string;
      interval?: RevenueInterval;
    }) => {
      dispatch({ type: ANALYTICS_REQUEST });
      try {
        const res = await api.get("/admin/analytics/dashboard", {
          params: {
            range: params?.range,
            from: params?.from,
            to: params?.to,
            interval: params?.interval,
          },
        });

        const dashboard = unwrapData<AnalyticsDashboard>(res.data);
        if (!dashboard?.summary) throw new Error("Failed to load analytics");

        dispatch({
          type: ANALYTICS_DASHBOARD_SUCCESS,
          payload: { dashboard },
        });

        return dashboard;
      } catch (err: any) {
        const msg =
          err?.response?.data?.message || "Failed to load analytics dashboard";
        dispatch({ type: ANALYTICS_FAILURE, payload: msg });
        throw err;
      }
    },
    [],
  );

  const getRevenueOverview = useCallback(async (params?: { days?: number }) => {
    dispatch({ type: ANALYTICS_REVENUE_OVERVIEW_REQUEST });
    try {
      const res = await api.get("/admin/analytics/revenue-overview", {
        params: {
          days: params?.days,
        },
      });

      const revenueOverview = unwrapData<RevenueOverview>(res.data);
      if (!revenueOverview?.points)
        throw new Error("Failed to load revenue overview");

      dispatch({
        type: ANALYTICS_REVENUE_OVERVIEW_SUCCESS,
        payload: { revenueOverview },
      });

      return revenueOverview;
    } catch (err: any) {
      const msg =
        err?.response?.data?.message || "Failed to load revenue overview";
      dispatch({ type: ANALYTICS_REVENUE_OVERVIEW_FAILURE, payload: msg });
      throw err;
    }
  }, []);

  const value = useMemo(
    () => ({
      dashboard: state.dashboard,

      revenueOverview: state.revenueOverview,
      revenueOverviewLoading: state.revenueOverviewLoading,
      revenueOverviewError: state.revenueOverviewError,

      range: state.range,
      from: state.from,
      to: state.to,
      interval: state.interval,

      loading: state.loading,
      error: state.error,

      setFilters,
      getDashboard,
      getRevenueOverview,
    }),
    [state, setFilters, getDashboard, getRevenueOverview],
  );

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
};

export const useAnalyticsApi = () => {
  const ctx = useContext(AnalyticsContext);
  if (!ctx)
    throw new Error("useAnalyticsApi must be used inside AnalyticsProvider");
  return ctx;
};
