export type AnalyticsDateRange =
  | "all"
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "lastYear"
  | "custom";

export type AnalyticsOrderSource =
  | "all"
  | "website"
  | "subscription"
  | "imported";

export type RevenueInterval = "week" | "month" | "year";

export type AnalyticsSummary = {
  totalOrders: number;
  revenue: number;
  grossRevenue: number;
  refundAmount: number;
  netRevenue: number;
  averageOrderValue: number;
  unitsSold: number;
  averageUnitsPerOrder: number;
  totalRefunds: number;
  newCustomers: number;
  repeatCustomers: number;
  pendingOrders: number;
  paidOrders: number;
  failedOrders: number;
  cancelledOrders: number;
  refundPendingOrders: number;
  refundedOrders: number;
  refundFailedOrders: number;
  lowStockItems: number;
  outOfStockItems: number;
  orderStatus: {
    Pending: number;
    Paid: number;
    Failed: number;
    Cancelled: number;
    "Refund Pending": number;
    Refunded: number;
    "Refund Failed": number;
  };
};

export type AnalyticsOverviewMetrics = {
  netRevenue: number;
  grossRevenue: number;
  refundAmount: number;
  totalOrders: number;
  unitsSold: number;
  averageOrderValue: number;
  averageUnitsPerOrder: number;
};

export type AnalyticsMetricChange = {
  current: number;
  previous: number;
  absoluteChange: number;
  percentChange: number | null;
  percentChangeAvailable: boolean;
  direction: "up" | "down" | "flat";
};

export type AnalyticsComparisonPeriod = {
  from: string;
  to: string;
  start: string;
  end: string;
  days: number;
};

export type AnalyticsOverviewComparison = {
  available: boolean;
  reason: string | null;
  strategy: string | null;
  timeZone: string;
  currentPeriod: AnalyticsComparisonPeriod | null;
  previousPeriod: AnalyticsComparisonPeriod | null;
  current: (AnalyticsOverviewMetrics & { revenue?: number }) | null;
  previous: (AnalyticsOverviewMetrics & { revenue?: number }) | null;
  changes: {
    grossRevenue: AnalyticsMetricChange;
    refundAmount: AnalyticsMetricChange;
    netRevenue: AnalyticsMetricChange;
    totalOrders: AnalyticsMetricChange;
    unitsSold: AnalyticsMetricChange;
    averageOrderValue: AnalyticsMetricChange;
    averageUnitsPerOrder: AnalyticsMetricChange;
  } | null;
};

export type AnalyticsOverview = {
  metrics: AnalyticsOverviewMetrics;
  comparison: AnalyticsOverviewComparison;
};

export type RevenuePoint = {
  label: string;
  revenue: number;
  orders: number;
};

export type RevenueSeries = {
  interval: RevenueInterval;
  points: RevenuePoint[];
};

export type RevenueOverviewPoint = {
  date: string;
  label: string;
  revenue: number;
  orders: number;
  isToday: boolean;
};

export type RevenueOverview = {
  days: number;
  points: RevenueOverviewPoint[];
};

export type TopProductVariant = {
  variantId: string;
  name: string;
  sku: string;
  revenue: number;
  quantity: number;
};

export type TopProduct = {
  productId: string;
  productName: string;
  totalRevenue: number;
  totalQuantity: number;
  variants: TopProductVariant[];
};

export type TopProductsResult = {
  products: TopProduct[];
};

export type RecentOrder = {
  _id: string;
  orderId: string;
  status: string;
  total: number;
  createdAt: string;
  customer?: {
    _id?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
};

export type RecentOrdersResult = {
  orders: RecentOrder[];
};

export type LowStockItem = {
  _id: string;
  sku: string;
  name: string;
  stockQuantity: number;
  reservedQuantity: number;
  lowStockAlert: number;
  available: number;
  product?: {
    _id: string;
    name: string;
    status: string;
  };
};

export type LowStockResult = {
  items: LowStockItem[];
};

export type AnalyticsDashboard = {
  overview: AnalyticsOverview;
  summary: AnalyticsSummary;
  revenue: RevenueSeries;
  topProducts: TopProductsResult;
  recentOrders: RecentOrdersResult;
  lowStock: LowStockResult;
  outOfStock: LowStockResult;
};

export interface AnalyticsState {
  dashboard: AnalyticsDashboard | null;

  revenueOverview: RevenueOverview | null;

  range: AnalyticsDateRange;
  orderSource: AnalyticsOrderSource;
  from: string;
  to: string;
  interval: RevenueInterval;

  loading: boolean;
  error: string | null;

  revenueOverviewLoading: boolean;
  revenueOverviewError: string | null;
}

export const initialAnalyticsState: AnalyticsState = {
  dashboard: null,

  revenueOverview: null,

  range: "today",
  orderSource: "all",
  from: "",
  to: "",
  interval: "week",

  loading: false,
  error: null,

  revenueOverviewLoading: false,
  revenueOverviewError: null,
};
