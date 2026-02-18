import {
  type AnalyticsDashboard,
  type AnalyticsDateRange,
  type AnalyticsState,
  type RevenueOverview,
  type RevenueInterval,
  initialAnalyticsState,
} from "./constants";

export const ANALYTICS_REQUEST = "ANALYTICS_REQUEST";
export const ANALYTICS_FAILURE = "ANALYTICS_FAILURE";

export const ANALYTICS_DASHBOARD_SUCCESS = "ANALYTICS_DASHBOARD_SUCCESS";
export const ANALYTICS_SET_FILTERS = "ANALYTICS_SET_FILTERS";

export const ANALYTICS_REVENUE_OVERVIEW_REQUEST =
  "ANALYTICS_REVENUE_OVERVIEW_REQUEST";
export const ANALYTICS_REVENUE_OVERVIEW_SUCCESS =
  "ANALYTICS_REVENUE_OVERVIEW_SUCCESS";
export const ANALYTICS_REVENUE_OVERVIEW_FAILURE =
  "ANALYTICS_REVENUE_OVERVIEW_FAILURE";

export type AnalyticsAction =
  | { type: typeof ANALYTICS_REQUEST }
  | { type: typeof ANALYTICS_FAILURE; payload: string }
  | {
      type: typeof ANALYTICS_DASHBOARD_SUCCESS;
      payload: { dashboard: AnalyticsDashboard };
    }
  | { type: typeof ANALYTICS_REVENUE_OVERVIEW_REQUEST }
  | {
      type: typeof ANALYTICS_REVENUE_OVERVIEW_SUCCESS;
      payload: { revenueOverview: RevenueOverview };
    }
  | { type: typeof ANALYTICS_REVENUE_OVERVIEW_FAILURE; payload: string }
  | {
      type: typeof ANALYTICS_SET_FILTERS;
      payload: {
        range: AnalyticsDateRange;
        from: string;
        to: string;
        interval: RevenueInterval;
      };
    };

export default function AnalyticsReducer(
  state: AnalyticsState,
  action: AnalyticsAction,
): AnalyticsState {
  switch (action.type) {
    case ANALYTICS_REQUEST:
      return { ...state, loading: true, error: null };

    case ANALYTICS_FAILURE:
      return { ...state, loading: false, error: action.payload };

    case ANALYTICS_SET_FILTERS:
      return {
        ...state,
        range: action.payload.range,
        from: action.payload.from,
        to: action.payload.to,
        interval: action.payload.interval,
      };

    case ANALYTICS_DASHBOARD_SUCCESS:
      return {
        ...state,
        loading: false,
        error: null,
        dashboard: action.payload.dashboard,
      };

    case ANALYTICS_REVENUE_OVERVIEW_REQUEST:
      return {
        ...state,
        revenueOverviewLoading: true,
        revenueOverviewError: null,
      };

    case ANALYTICS_REVENUE_OVERVIEW_FAILURE:
      return {
        ...state,
        revenueOverviewLoading: false,
        revenueOverviewError: action.payload,
      };

    case ANALYTICS_REVENUE_OVERVIEW_SUCCESS:
      return {
        ...state,
        revenueOverviewLoading: false,
        revenueOverviewError: null,
        revenueOverview: action.payload.revenueOverview,
      };

    default:
      return state || initialAnalyticsState;
  }
}
