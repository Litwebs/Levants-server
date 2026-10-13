import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DollarSign,
  ShoppingCart,
  Package,
  BarChart3,
  Download,
} from "lucide-react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Select,
  Badge,
  Button,
  Skeleton,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "../components/common";
import {
  SimpleBarChart,
  MultiLineChart,
  DonutChart,
} from "../components/charts";

import {
  useAnalyticsApi,
  type AnalyticsComparisonMode,
  type AnalyticsDateRange,
  type AnalyticsOrderSource,
  type AnalyticsMetricChange,
  type ProductDetail,
  type VariantDetail,
  type RevenueInterval,
  analyticsDateRangeOptions,
  analyticsOrderSourceOptions,
  analyticsComparisonOptions,
  analyticsIntervalOptions,
  defaultAnalyticsIntervalForRange,
} from "../context/Analytics";

import styles from "./Reports.module.css";

import { formatCurrencyGBP, formatCompactNumber } from "../lib/numberFormat";
import { downloadCsv } from "../lib/csvExport";

const formatCurrency = (amount: unknown) => {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (Number.isNaN(n)) return "—";
  return formatCurrencyGBP(n);
};

const formatDateTime = (dateString: string) => {
  if (!dateString) return "—";
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB");
};

const getCustomerLabel = (order: any) => {
  const c = order?.customer;
  const name = `${c?.firstName || ""} ${c?.lastName || ""}`.trim();
  return name || c?.email || "Guest";
};


const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return fallback;
  }

  const response = (error as {
    response?: { data?: { message?: unknown } };
  }).response;
  const message = response?.data?.message;

  return typeof message === "string" && message.trim() ? message : fallback;
};

const formatDecimal = (value: unknown, maximumFractionDigits = 2) => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  });
};

const KpiTrend = ({
  change,
  comparisonMode,
}: {
  change?: AnalyticsMetricChange;
  comparisonMode: AnalyticsComparisonMode;
}) => {
  if (!change) return null;

  const value = change.percentChangeAvailable
    ? `${change.percentChange && change.percentChange > 0 ? "+" : ""}${formatDecimal(
        change.percentChange ?? 0,
        2,
      )}%`
    : "New";

  const trendClass =
    change.direction === "up"
      ? styles.trendUp
      : change.direction === "down"
        ? styles.trendDown
        : styles.trendFlat;

  return (
    <span className={styles.kpiTrend}>
      <span className={trendClass}>{value}</span>
      <span className={styles.trendLabel}>
        {comparisonMode === "previous_year"
          ? "vs previous year"
          : "vs previous period"}
      </span>
    </span>
  );
};

const PRODUCT_TREND_COLORS = ["primary", "success", "info"] as const;

type AnalyticsTab =
  | "overview"
  | "subscriptions"
  | "sales"
  | "products"
  | "variants"
  | "data";

const ANALYTICS_TABS: { id: AnalyticsTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "subscriptions", label: "Subscriptions" },
  { id: "sales", label: "Sales" },
  { id: "products", label: "Products" },
  { id: "variants", label: "Variants" },
  { id: "data", label: "Data & Stock" },
];

const AnalyticsStatePanel = ({
  title,
  message,
  kind = "empty",
  onRetry,
}: {
  title: string;
  message: string;
  kind?: "loading" | "error" | "empty";
  onRetry?: () => void;
}) => (
  <div
    className={`${styles.statePanel} ${styles[`statePanel_${kind}`]}`}
    role={kind === "error" ? "alert" : "status"}
    aria-live="polite"
  >
    {kind === "loading" ? (
      <div className={styles.stateSkeletons} aria-hidden="true">
        <Skeleton width="42%" height={18} />
        <Skeleton width="72%" height={14} />
      </div>
    ) : null}
    <div className={styles.stateCopy}>
      <strong className={styles.stateTitle}>{title}</strong>
      <span className={styles.stateMessage}>{message}</span>
    </div>
    {onRetry ? (
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    ) : null}
  </div>
);

const Reports = () => {
  const {
    dashboard,
    loading,
    error,
    range,
    orderSource,
    from,
    to,
    interval,
    comparison,
    setFilters,
    getDashboard,
    getProductDetail,
    getVariantDetail,
  } = useAnalyticsApi();

  const [selectedProductId, setSelectedProductId] = useState<string | null>(
    null,
  );
  const [productDetail, setProductDetail] = useState<ProductDetail | null>(
    null,
  );
  const [productDetailLoading, setProductDetailLoading] = useState(false);
  const [productDetailError, setProductDetailError] = useState<string | null>(
    null,
  );
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null,
  );
  const [variantDetail, setVariantDetail] = useState<VariantDetail | null>(
    null,
  );
  const [variantDetailLoading, setVariantDetailLoading] = useState(false);
  const [variantDetailError, setVariantDetailError] = useState<string | null>(
    null,
  );
  const [productDetailRetryKey, setProductDetailRetryKey] = useState(0);
  const [variantDetailRetryKey, setVariantDetailRetryKey] = useState(0);
  const [activeTab, setActiveTab] = useState<AnalyticsTab>("overview");

  const openProductDetail = (productId: unknown) => {
    setActiveTab("products");
    setSelectedVariantId(null);
    setSelectedProductId(String(productId));
  };

  const openVariantDetail = (variantId: unknown) => {
    setActiveTab("variants");
    setSelectedProductId(null);
    setSelectedVariantId(String(variantId));
  };

  useEffect(() => {
    const targetId = selectedVariantId
      ? "variant-analytics-detail"
      : selectedProductId
        ? "product-analytics-detail"
        : null;
    if (!targetId) return;

    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(targetId)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedProductId, selectedVariantId]);

  const requestDashboard = useCallback(() => {
    const isCustom = range === "custom";
    if (isCustom && (!from || !to)) return Promise.resolve();

    return getDashboard({
      interval,
      orderSource,
      comparison,
      ...(isCustom ? { from, to } : { range }),
    }).then(() => undefined);
  }, [
    range,
    orderSource,
    from,
    to,
    interval,
    comparison,
    getDashboard,
  ]);

  useEffect(() => {
    void requestDashboard();
  }, [requestDashboard]);

  useEffect(() => {
    if (!selectedProductId) {
      setProductDetail(null);
      setProductDetailError(null);
      return;
    }

    const isCustom = range === "custom";
    if (isCustom && (!from || !to)) return;

    let cancelled = false;
    setProductDetailLoading(true);
    setProductDetailError(null);

    void getProductDetail(selectedProductId, {
      interval,
      orderSource,
      ...(isCustom ? { from, to } : { range }),
    })
      .then((detail) => {
        if (!cancelled) setProductDetail(detail);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setProductDetail(null);
        setProductDetailError(
          getApiErrorMessage(err, "Failed to load product detail"),
        );
      })
      .finally(() => {
        if (!cancelled) setProductDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectedProductId,
    range,
    orderSource,
    from,
    to,
    interval,
    productDetailRetryKey,
    getProductDetail,
  ]);

  useEffect(() => {
    if (!selectedVariantId) {
      setVariantDetail(null);
      setVariantDetailError(null);
      return;
    }

    const isCustom = range === "custom";
    if (isCustom && (!from || !to)) return;

    let cancelled = false;
    setVariantDetailLoading(true);
    setVariantDetailError(null);

    void getVariantDetail(selectedVariantId, {
      interval,
      orderSource,
      ...(isCustom ? { from, to } : { range }),
    })
      .then((detail) => {
        if (!cancelled) setVariantDetail(detail);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setVariantDetail(null);
        setVariantDetailError(
          getApiErrorMessage(err, "Failed to load variant detail"),
        );
      })
      .finally(() => {
        if (!cancelled) setVariantDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectedVariantId,
    range,
    orderSource,
    from,
    to,
    interval,
    variantDetailRetryKey,
    getVariantDetail,
  ]);

  const summary = dashboard?.summary;
  const overview = dashboard?.overview;
  const overviewMetrics = overview?.metrics;
  const overviewChanges = overview?.comparison?.available
    ? overview.comparison.changes
    : null;
  const revenuePoints = dashboard?.revenue?.points ?? [];

  const revenueChartData = useMemo(
    () => revenuePoints.map((p) => ({ label: p.label, value: p.netRevenue })),
    [revenuePoints],
  );

  const ordersChartData = useMemo(
    () => revenuePoints.map((p) => ({ label: p.label, value: p.orders })),
    [revenuePoints],
  );

  const seriesTotals = dashboard?.revenue?.totals;
  const totalRevenueInPeriod =
    seriesTotals?.netRevenue ??
    revenuePoints.reduce((sum, p) => sum + (p.netRevenue || 0), 0);
  const totalOrdersInPeriod =
    seriesTotals?.orders ??
    revenuePoints.reduce((sum, p) => sum + (p.orders || 0), 0);

  const orderStatusData = useMemo(() => {
    const counts = summary?.orderStatus;
    return [
      { label: "Pending", value: counts?.Pending ?? 0, color: "#f59e0b" },
      { label: "Paid", value: counts?.Paid ?? 0, color: "#10b981" },
      { label: "Failed", value: counts?.Failed ?? 0, color: "#ef4444" },
      { label: "Cancelled", value: counts?.Cancelled ?? 0, color: "#6b7280" },
      { label: "Refunded", value: counts?.Refunded ?? 0, color: "#8b5cf6" },
      {
        label: "Refund Failed",
        value: counts?.["Refund Failed"] ?? 0,
        color: "#dc2626",
      },
    ].filter((d) => d.value > 0);
  }, [summary?.orderStatus]);

  const productsByRevenue =
    dashboard?.topProducts?.byRevenue ?? dashboard?.topProducts?.products ?? [];
  const productsByUnits = dashboard?.topProducts?.byUnits ?? [];
  const lowestProductsByRevenue =
    dashboard?.topProducts?.lowestByRevenue ?? [];
  const lowestProductsByUnits = dashboard?.topProducts?.lowestByUnits ?? [];
  const productTotals = dashboard?.topProducts?.totals;
  const productTrendProducts = dashboard?.productTrends?.products;
  const variantTrendVariants = dashboard?.variantTrends?.variants;
  const variantsByUnits = dashboard?.variantUnits?.byUnits ?? [];
  const variantUnitTotals = dashboard?.variantUnits?.totals;
  const maxVariantUnits = variantsByUnits[0]?.totalUnits ?? 0;
  const variantsByRevenue = dashboard?.variantRevenue?.byRevenue ?? [];
  const variantRevenueTotals = dashboard?.variantRevenue?.totals;
  const maxVariantRevenue = variantsByRevenue[0]?.totalRevenue ?? 0;
  const variantRealisedPrice = dashboard?.variantRealisedPrice;
  const variantPriceComparison = dashboard?.variantPriceComparison;
  const variantSalesMix = dashboard?.variantSalesMix;
  const variantContribution = dashboard?.variantContribution;
  const activeSubscriptions = dashboard?.activeSubscriptions;
  const averageSubscriptionValue = dashboard?.averageSubscriptionValue;
  const newSubscriptions = dashboard?.newSubscriptions;
  const cancelledSubscriptions = dashboard?.cancelledSubscriptions;
  const subscriptionRevenue = dashboard?.subscriptionRevenue;
  const recurringVsOneTime = dashboard?.recurringVsOneTime;
  const subscriptionTrends = dashboard?.subscriptionTrends;
  const topSubscriptionProductsVariants =
    dashboard?.topSubscriptionProductsVariants;

  const productRevenueTrendSeries = useMemo(
    () =>
      (productTrendProducts ?? []).map((product, index) => ({
        key: String(product.productId),
        label:
          product.catalogStatus === "deleted"
            ? `${product.productName} · Deleted`
            : product.productName,
        color:
          PRODUCT_TREND_COLORS[index % PRODUCT_TREND_COLORS.length],
        data: product.points.map((point) => ({
          label: point.label,
          value: point.revenue,
        })),
      })),
    [productTrendProducts],
  );

  const productUnitsTrendSeries = useMemo(
    () =>
      (productTrendProducts ?? []).map((product, index) => ({
        key: String(product.productId),
        label:
          product.catalogStatus === "deleted"
            ? `${product.productName} · Deleted`
            : product.productName,
        color:
          PRODUCT_TREND_COLORS[index % PRODUCT_TREND_COLORS.length],
        data: product.points.map((point) => ({
          label: point.label,
          value: point.units,
        })),
      })),
    [productTrendProducts],
  );

  const variantRevenueTrendSeries = useMemo(
    () =>
      (variantTrendVariants ?? []).map((variant, index) => ({
        key: String(variant.variantId),
        label:
          variant.catalogStatus === "deleted"
            ? `${variant.variantName} · Deleted`
            : variant.variantName,
        color:
          PRODUCT_TREND_COLORS[index % PRODUCT_TREND_COLORS.length],
        data: variant.points.map((point) => ({
          label: point.label,
          value: point.revenue,
        })),
      })),
    [variantTrendVariants],
  );

  const variantUnitsTrendSeries = useMemo(
    () =>
      (variantTrendVariants ?? []).map((variant, index) => ({
        key: String(variant.variantId),
        label:
          variant.catalogStatus === "deleted"
            ? `${variant.variantName} · Deleted`
            : variant.variantName,
        color:
          PRODUCT_TREND_COLORS[index % PRODUCT_TREND_COLORS.length],
        data: variant.points.map((point) => ({
          label: point.label,
          value: point.units,
        })),
      })),
    [variantTrendVariants],
  );

  const productDisplay = (product: (typeof productsByRevenue)[number]) => ({
    productId: product.productId,
    label: product.productName,
    revenue: product.totalRevenue,
    units: product.totalQuantity,
    orders: product.orderCount,
    averageSellingPrice: product.averageSellingPrice,
    averageRevenuePerOrder: product.averageRevenuePerOrder,
    averageUnitsPerOrder: product.averageUnitsPerOrder,
    revenueContributionPercent: product.revenueContributionPercent,
    unitContributionPercent: product.unitContributionPercent,
    catalogStatus: product.catalogStatus,
  });

  const productsByRevenueChart = productsByRevenue.map(productDisplay);
  const productsByUnitsChart = productsByUnits.map(productDisplay);
  const lowestByRevenueChart = lowestProductsByRevenue.map(productDisplay);
  const lowestByUnitsChart = lowestProductsByUnits.map(productDisplay);

  const salesChannels = dashboard?.salesBreakdown?.channels ?? [];
  const salesTrendSeries = useMemo(
    () =>
      (dashboard?.salesTrends?.channels ?? [])
        .filter(
          (channel) =>
            orderSource === "all" || channel.key === orderSource,
        )
        .map((channel) => ({
          key: channel.key,
          label: channel.label,
          color: (channel.key === "website"
            ? "primary"
            : channel.key === "subscription"
              ? "success"
              : "info") as "primary" | "success" | "info",
          data: channel.points.map((point) => ({
            label: point.label,
            value: point.netRevenue,
          })),
        })),
    [dashboard?.salesTrends?.channels, orderSource],
  );
  const revenueComposition = dashboard?.revenueComposition;
  const recentOrders = dashboard?.recentOrders?.orders ?? [];
  const lowStockItems = dashboard?.lowStock?.items ?? [];

  const customRangeIncomplete = range === "custom" && (!from || !to);
  const initialLoading = loading && !dashboard && !customRangeIncomplete;
  const fatalError = Boolean(error && !dashboard && !customRangeIncomplete);
  const refreshing = Boolean(loading && dashboard && !customRangeIncomplete);
  const canShowDashboard = Boolean(dashboard) && !customRangeIncomplete;
  const hasSelectedPeriodActivity =
    Number(overviewMetrics?.totalOrders ?? 0) > 0 ||
    Number(overviewMetrics?.unitsSold ?? 0) > 0 ||
    Number(overviewMetrics?.grossRevenue ?? 0) !== 0 ||
    Number(overviewMetrics?.refundAmount ?? 0) !== 0 ||
    Number(newSubscriptions?.newSubscriptions ?? 0) > 0 ||
    Number(cancelledSubscriptions?.cancelledSubscriptions ?? 0) > 0;

  const hasSubscriptionPeriodActivity =
    Number(newSubscriptions?.newSubscriptions ?? 0) > 0 ||
    Number(cancelledSubscriptions?.cancelledSubscriptions ?? 0) > 0 ||
    Number(subscriptionRevenue?.grossRevenue ?? 0) !== 0 ||
    Number(subscriptionRevenue?.refundAmount ?? 0) !== 0 ||
    Number(subscriptionRevenue?.subscriptionRevenue ?? 0) !== 0;

  const exportScope =
    range === "custom" ? `${from || "start"}-${to || "end"}` : range;
  const exportSuffix = `${exportScope}-${orderSource}`;

  const exportSalesChannels = () =>
    downloadCsv(`analytics-sales-channels-${exportSuffix}`, salesChannels, [
      { header: "Channel", value: (row) => row.label },
      { header: "Gross Revenue", value: (row) => row.grossRevenue },
      { header: "Refunds", value: (row) => row.refundAmount },
      { header: "Net Revenue", value: (row) => row.netRevenue },
      { header: "Orders", value: (row) => row.totalOrders },
      { header: "Units", value: (row) => row.unitsSold },
      { header: "Average Order Value", value: (row) => row.averageOrderValue },
      {
        header: "Average Units Per Order",
        value: (row) => row.averageUnitsPerOrder,
      },
    ]);

  const exportProducts = () =>
    downloadCsv(`analytics-products-${exportSuffix}`, productsByRevenueChart, [
      { header: "Product", value: (row) => row.label },
      { header: "Catalog Status", value: (row) => row.catalogStatus },
      { header: "Revenue", value: (row) => row.revenue },
      { header: "Units", value: (row) => row.units },
      { header: "Orders", value: (row) => row.orders },
      {
        header: "Realised ASP",
        value: (row) => row.averageSellingPrice,
      },
      {
        header: "Revenue Contribution %",
        value: (row) => row.revenueContributionPercent,
      },
      {
        header: "Unit Contribution %",
        value: (row) => row.unitContributionPercent,
      },
    ]);

  const exportVariants = () =>
    downloadCsv(`analytics-variants-${exportSuffix}`, variantsByRevenue, [
      { header: "Product", value: (row) => row.productName },
      { header: "Variant", value: (row) => row.variantName },
      { header: "SKU", value: (row) => row.sku },
      { header: "Catalog Status", value: (row) => row.catalogStatus },
      { header: "Revenue", value: (row) => row.totalRevenue },
      { header: "Units", value: (row) => row.totalUnits },
      { header: "Orders", value: (row) => row.orderCount },
      {
        header: "Realised ASP",
        value: (row) => row.realisedSellingPrice,
      },
      { header: "Current Price", value: (row) => row.currentPrice },
      {
        header: "Price Difference",
        value: (row) => row.priceDifference,
      },
    ]);

  const exportRecentOrders = () =>
    downloadCsv(`analytics-recent-orders-${exportSuffix}`, recentOrders, [
      { header: "Order ID", value: (row) => row.orderId },
      { header: "Customer", value: (row) => getCustomerLabel(row) },
      { header: "Status", value: (row) => row.status },
      { header: "Total", value: (row) => row.total },
      { header: "Created At", value: (row) => row.createdAt },
    ]);

  return (
    <div className={styles.reports}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Analytics</h1>
          <p className={styles.subtitle}>Business performance overview</p>
        </div>

        <div className={styles.headerActions}>
          <Select
            aria-label="Date range"
            value={range}
            onChange={(value) =>
              setFilters({
                range: value as AnalyticsDateRange,
                orderSource,
                interval: defaultAnalyticsIntervalForRange(
                  value as AnalyticsDateRange,
                ),
              })
            }
            options={analyticsDateRangeOptions}
          />

          <Select
            aria-label="Order source"
            value={orderSource}
            onChange={(value) =>
              setFilters({
                range,
                orderSource: value as AnalyticsOrderSource,
                interval,
              })
            }
            options={analyticsOrderSourceOptions}
          />

          <Select
            aria-label="Comparison"
            value={comparison}
            onChange={(value) =>
              setFilters({
                range,
                orderSource,
                from,
                to,
                interval,
                comparison: value as AnalyticsComparisonMode,
              })
            }
            options={analyticsComparisonOptions}
          />

          <Select
            aria-label="Interval"
            value={interval}
            onChange={(value) =>
              setFilters({
                range,
                orderSource,
                from,
                to,
                interval: value as RevenueInterval,
              })
            }
            options={analyticsIntervalOptions}
          />

          {range === "custom" ? (
            <div className={styles.customDateRow}>
              <input
                aria-label="From date"
                className={styles.dateInput}
                type="date"
                value={from}
                onChange={(e) =>
                  setFilters({
                    range,
                    orderSource,
                    from: e.target.value,
                    to,
                    interval,
                  })
                }
              />
              <input
                aria-label="To date"
                className={styles.dateInput}
                type="date"
                value={to}
                onChange={(e) =>
                  setFilters({
                    range,
                    orderSource,
                    from,
                    to: e.target.value,
                    interval,
                  })
                }
              />
            </div>
          ) : null}
        </div>
      </div>

      {customRangeIncomplete ? (
        <AnalyticsStatePanel
          title="Choose a complete custom date range"
          message="Select both a start date and an end date before analytics are loaded."
        />
      ) : null}

      {initialLoading ? (
        <AnalyticsStatePanel
          kind="loading"
          title="Loading analytics"
          message="Calculating sales, product, variant, subscription, and inventory metrics."
        />
      ) : null}

      {fatalError ? (
        <AnalyticsStatePanel
          kind="error"
          title="Analytics could not be loaded"
          message={error || "The analytics request failed."}
          onRetry={() => void requestDashboard()}
        />
      ) : null}

      {refreshing ? (
        <div className={styles.refreshStatus} role="status" aria-live="polite">
          Refreshing analytics for the selected filters…
        </div>
      ) : null}

      {error && dashboard && !customRangeIncomplete ? (
        <AnalyticsStatePanel
          kind="error"
          title="Analytics could not be refreshed"
          message={error}
          onRetry={() => void requestDashboard()}
        />
      ) : null}

      {canShowDashboard && !loading && !error && !hasSelectedPeriodActivity ? (
        <AnalyticsStatePanel
          title="No activity for these filters"
          message="No sales or subscription lifecycle activity matched this period. Current-state subscription and stock metrics may still appear below."
        />
      ) : null}

      {canShowDashboard ? (
        <div className={styles.analyticsContent} aria-busy={loading}>
      <div
        className={styles.analyticsTabs}
        role="tablist"
        aria-label="Analytics sections"
      >
        {ANALYTICS_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`${styles.analyticsTab} ${
              activeTab === tab.id ? styles.analyticsTabActive : ""
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {!hasSelectedPeriodActivity &&
      (activeTab === "sales" ||
        activeTab === "products" ||
        activeTab === "variants") ? (
        <div className={styles.tabEmptyState}>
          No period activity is available for this section with the selected
          filters.
        </div>
      ) : null}

      <div className={styles.kpiGrid} hidden={activeTab !== "overview"}>
        <Card className={styles.kpiCard}>
          <div className={styles.kpiContent}>
            <div className={`${styles.kpiIcon} ${styles.success}`}>
              <DollarSign size={24} />
            </div>
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>Net Revenue</span>
              <span className={styles.kpiValue}>
                {formatCurrency(overviewMetrics?.netRevenue ?? summary?.netRevenue ?? 0)}
              </span>
              <KpiTrend
                change={overviewChanges?.netRevenue}
                comparisonMode={comparison}
              />
            </div>
          </div>
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiContent}>
            <div className={`${styles.kpiIcon} ${styles.primary}`}>
              <DollarSign size={24} />
            </div>
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>Gross Sales</span>
              <span className={styles.kpiValue}>
                {formatCurrency(overviewMetrics?.grossRevenue ?? summary?.grossRevenue ?? 0)}
              </span>
              <KpiTrend
                change={overviewChanges?.grossRevenue}
                comparisonMode={comparison}
              />
            </div>
          </div>
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiContent}>
            <div className={`${styles.kpiIcon} ${styles.info}`}>
              <ShoppingCart size={24} />
            </div>
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>Orders</span>
              <span className={styles.kpiValue}>
                {formatCompactNumber(overviewMetrics?.totalOrders ?? summary?.totalOrders ?? 0)}
              </span>
              <KpiTrend
                change={overviewChanges?.totalOrders}
                comparisonMode={comparison}
              />
            </div>
          </div>
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiContent}>
            <div className={`${styles.kpiIcon} ${styles.warning}`}>
              <Package size={24} />
            </div>
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>Units Sold</span>
              <span className={styles.kpiValue}>
                {formatCompactNumber(overviewMetrics?.unitsSold ?? summary?.unitsSold ?? 0)}
              </span>
              <KpiTrend
                change={overviewChanges?.unitsSold}
                comparisonMode={comparison}
              />
            </div>
          </div>
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiContent}>
            <div className={`${styles.kpiIcon} ${styles.primary}`}>
              <BarChart3 size={24} />
            </div>
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>Average Order Value</span>
              <span className={styles.kpiValue}>
                {formatCurrency(
                  overviewMetrics?.averageOrderValue ?? summary?.averageOrderValue ?? 0,
                )}
              </span>
              <KpiTrend
                change={overviewChanges?.averageOrderValue}
                comparisonMode={comparison}
              />
            </div>
          </div>
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiContent}>
            <div className={`${styles.kpiIcon} ${styles.info}`}>
              <BarChart3 size={24} />
            </div>
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>Average Units / Order</span>
              <span className={styles.kpiValue}>
                {formatDecimal(
                  overviewMetrics?.averageUnitsPerOrder ??
                    summary?.averageUnitsPerOrder ??
                    0,
                )}
              </span>
              <KpiTrend
                change={overviewChanges?.averageUnitsPerOrder}
                comparisonMode={comparison}
              />
            </div>
          </div>
        </Card>
      </div>

      <Card
        hidden={activeTab !== "subscriptions"}
        className={`${styles.fullWidthChart} ${styles.subscriptionCard} ${
          !hasSubscriptionPeriodActivity ? styles.subscriptionCardQuiet : ""
        }`}
      >
        <CardHeader>
          <CardTitle>Subscription Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`${styles.metricsGrid} ${styles.subscriptionMetricsGrid}`}
          >
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatCompactNumber(
                  activeSubscriptions?.activeSubscriptions ?? 0,
                )}
              </span>
              <span className={styles.metricLabel}>Active Subscriptions</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatCurrency(
                  averageSubscriptionValue?.averageSubscriptionValue ?? 0,
                )}
              </span>
              <span className={styles.metricLabel}>
                Avg Subscription Value
              </span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatCompactNumber(newSubscriptions?.newSubscriptions ?? 0)}
              </span>
              <span className={styles.metricLabel}>New Subscriptions</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatCompactNumber(
                  cancelledSubscriptions?.cancelledSubscriptions ?? 0,
                )}
              </span>
              <span className={styles.metricLabel}>Cancelled Subscriptions</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatCurrency(subscriptionRevenue?.subscriptionRevenue ?? 0)}
              </span>
              <span className={styles.metricLabel}>Subscription Revenue</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatCurrency(subscriptionRevenue?.grossRevenue ?? 0)}
              </span>
              <span className={styles.metricLabel}>Gross Subscription Sales</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatCurrency(subscriptionRevenue?.refundAmount ?? 0)}
              </span>
              <span className={styles.metricLabel}>Subscription Refunds</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatCurrency(recurringVsOneTime?.oneTime.netRevenue ?? 0)}
              </span>
              <span className={styles.metricLabel}>One-Time Revenue</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatDecimal(
                  recurringVsOneTime?.subscription.netRevenueSharePercent ?? 0,
                )}%
              </span>
              <span className={styles.metricLabel}>Recurring Revenue Share</span>
            </div>
          </div>
          {!hasSubscriptionPeriodActivity ? (
            <div className={styles.compactEmptyState}>
              No subscription activity in this period. Current recurring state
              is shown above.
            </div>
          ) : null}

          <div
            className={`${styles.chartsGrid} ${styles.subscriptionRankings}`}
          >
            <div className={styles.productRankingSection}>
              <div className={styles.variantHeader}>
                <span className={styles.variantTitle}>
                  Top Subscription Products
                </span>
                <span className={styles.variantMeta}>
                  Collected merchandise revenue
                </span>
              </div>
              <div className={styles.productRanking}>
                {(topSubscriptionProductsVariants?.products.byRevenue ?? []).map(
                  (product, index) => (
                    <div key={product.productId} className={styles.rankItem}>
                      <span className={styles.rankNumber}>#{index + 1}</span>
                      <div className={styles.rankInfo}>
                        <span className={styles.rankName}>
                          {product.productName}
                          {product.catalogStatus === "deleted"
                            ? " · Deleted"
                            : ""}
                        </span>
                        <span className={styles.rankMeta}>
                          {formatCurrency(product.totalRevenue)} ·{" "}
                          {formatCompactNumber(product.totalUnits)} units ·{" "}
                          {formatDecimal(product.revenueContributionPercent)}%
                        </span>
                        <button
                          type="button"
                          className={styles.drilldownButton}
                          onClick={() => openProductDetail(product.productId)}
                        >
                          View details
                        </button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>

            <div className={styles.productRankingSection}>
              <div className={styles.variantHeader}>
                <span className={styles.variantTitle}>
                  Top Subscription Variants
                </span>
                <span className={styles.variantMeta}>
                  Collected merchandise revenue
                </span>
              </div>
              <div className={styles.productRanking}>
                {(topSubscriptionProductsVariants?.variants.byRevenue ?? []).map(
                  (variant, index) => (
                    <div key={variant.variantId} className={styles.rankItem}>
                      <span className={styles.rankNumber}>#{index + 1}</span>
                      <div className={styles.rankInfo}>
                        <span className={styles.rankName}>
                          {variant.variantName}
                          {variant.catalogStatus === "deleted"
                            ? " · Deleted"
                            : ""}
                        </span>
                        <span className={styles.rankMeta}>
                          {variant.productName} · {variant.sku} ·{" "}
                          {formatCurrency(variant.totalRevenue)} ·{" "}
                          {formatCompactNumber(variant.totalUnits)} units
                        </span>
                        <button
                          type="button"
                          className={styles.drilldownButton}
                          onClick={() => openVariantDetail(variant.variantId)}
                        >
                          View details
                        </button>
                      </div>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>

          <div className={styles.subscriptionTrendGrid}>
            <div className={styles.productDetailSection}>
              <div className={styles.variantHeader}>
                <span className={styles.variantTitle}>
                  Subscription Revenue Trend
                </span>
                <span className={styles.variantMeta}>
                  Net collected revenue
                </span>
              </div>
              <SimpleBarChart
                type="line"
                height={170}
                color="success"
                data={(subscriptionTrends?.points ?? []).map((point) => ({
                  label: point.label,
                  value: point.netRevenue,
                }))}
                valueFormatter={(value) =>
                  formatCurrencyGBP(value, { compact: true })
                }
              />
            </div>
            <div className={styles.productDetailSection}>
              <div className={styles.variantHeader}>
                <span className={styles.variantTitle}>
                  New Subscription Trend
                </span>
                <span className={styles.variantMeta}>Created in period</span>
              </div>
              <SimpleBarChart
                type="bar"
                height={170}
                color="primary"
                data={(subscriptionTrends?.points ?? []).map((point) => ({
                  label: point.label,
                  value: point.newSubscriptions,
                }))}
                valueFormatter={(value) => formatCompactNumber(value)}
              />
            </div>
            <div className={styles.productDetailSection}>
              <div className={styles.variantHeader}>
                <span className={styles.variantTitle}>
                  Cancellation Trend
                </span>
                <span className={styles.variantMeta}>
                  Effective cancellations
                </span>
              </div>
              <SimpleBarChart
                type="bar"
                height={170}
                color="info"
                data={(subscriptionTrends?.points ?? []).map((point) => ({
                  label: point.label,
                  value: point.cancelledSubscriptions,
                }))}
                valueFormatter={(value) => formatCompactNumber(value)}
              />
            </div>
          </div>

          <div className={styles.chartFooter}>
            <span className={styles.chartTotal}>
              Active is current recurring state. New and cancelled subscriptions
              use the selected date range; scheduled cancellations count only
              after becoming effective. Order-source filters do not apply to
              lifecycle metrics. Average subscription value is the current
              recurring charge per billing cycle for recurring-active
              subscriptions. Subscription revenue uses the selected date range
              and is always scoped to the Subscription sales channel.
            </span>
          </div>
        </CardContent>
      </Card>

      <div
        className={`${styles.periodSections} ${
          !hasSelectedPeriodActivity ? styles.periodSectionsHidden : ""
        }`}
      >
      <div className={styles.chartsGrid} hidden={activeTab !== "overview"}>
        <Card className={styles.chartCard}>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart
              data={revenueChartData}
              type="line"
              height={210}
              color="success"
              valueFormatter={(v) => formatCurrencyGBP(v, { compact: true })}
            />
            <div className={styles.chartFooter}>
              <span className={styles.chartTotal}>
                Period Total: {formatCurrency(totalRevenueInPeriod)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className={styles.chartCard}>
          <CardHeader>
            <CardTitle>Order Status</CardTitle>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={orderStatusData}
              size={160}
              centerLabel="Orders"
              centerValue={formatCompactNumber(summary?.totalOrders ?? 0)}
              showLegendValues
            />
          </CardContent>
        </Card>
      </div>

      <Card
        hidden={activeTab !== "overview"}
        className={styles.fullWidthChart}
      >
        <CardHeader>
          <CardTitle>Orders Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleBarChart
            data={ordersChartData}
            type="bar"
            height={190}
            color="info"
            valueFormatter={(v) => formatCompactNumber(v)}
          />
          <div className={styles.chartFooter}>
            <span className={styles.chartTotal}>
              Period Total: {formatCompactNumber(totalOrdersInPeriod)} orders
            </span>
          </div>
        </CardContent>
      </Card>

      <Card
        hidden={activeTab !== "sales"}
        className={styles.fullWidthChart}
      >
        <CardHeader>
          <CardTitle>Sales by Channel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.salesMixGrid}>
            {salesChannels.map((channel) => (
              <div key={channel.key} className={styles.salesMixCard}>
                <div className={styles.salesMixHeader}>
                  <span className={styles.salesMixTitle}>{channel.label}</span>
                  <span className={styles.salesMixShare}>
                    {formatDecimal(channel.grossRevenueShare)}% of gross sales
                  </span>
                </div>

                <div className={styles.salesMixPrimary}>
                  {formatCurrency(channel.netRevenue)}
                </div>
                <div className={styles.salesMixLabel}>Net revenue</div>

                <div className={styles.salesMixStats}>
                  <div>
                    <span className={styles.salesMixStatValue}>
                      {formatCurrency(channel.grossRevenue)}
                    </span>
                    <span className={styles.salesMixStatLabel}>Gross</span>
                  </div>
                  <div>
                    <span className={styles.salesMixStatValue}>
                      {formatCompactNumber(channel.totalOrders)}
                    </span>
                    <span className={styles.salesMixStatLabel}>Orders</span>
                  </div>
                  <div>
                    <span className={styles.salesMixStatValue}>
                      {formatCurrency(channel.averageOrderValue)}
                    </span>
                    <span className={styles.salesMixStatLabel}>AOV</span>
                  </div>
                  <div>
                    <span className={styles.salesMixStatValue}>
                      {formatCompactNumber(channel.unitsSold)}
                    </span>
                    <span className={styles.salesMixStatLabel}>Units</span>
                  </div>
                </div>

                {channel.refundAmount > 0 ? (
                  <div className={styles.salesMixRefund}>
                    Refunds: {formatCurrency(channel.refundAmount)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card
        hidden={activeTab !== "sales"}
        className={styles.fullWidthChart}
      >
        <CardHeader>
          <CardTitle>Sales Channel Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <MultiLineChart
            series={salesTrendSeries}
            height={210}
            valueFormatter={(value) =>
              formatCurrencyGBP(value, { compact: true })
            }
          />
          <div className={styles.chartFooter}>
            <span className={styles.chartTotal}>
              Net revenue by sales channel
            </span>
          </div>
        </CardContent>
      </Card>

      <Card
        hidden={activeTab !== "sales"}
        className={styles.fullWidthChart}
      >
        <CardHeader>
          <CardTitle>Revenue Composition</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.compositionGrid}>
            <div className={styles.compositionItem}>
              <span className={styles.compositionLabel}>Merchandise</span>
              <span className={styles.compositionValue}>
                {formatCurrency(revenueComposition?.merchandiseRevenue ?? 0)}
              </span>
              <span className={styles.compositionMeta}>
                Before discounts
              </span>
            </div>

            <div className={styles.compositionItem}>
              <span className={styles.compositionLabel}>Delivery Revenue</span>
              <span className={styles.compositionValue}>
                {formatCurrency(revenueComposition?.deliveryRevenue ?? 0)}
              </span>
              <span className={styles.compositionMeta}>
                Collected allocation
              </span>
            </div>

            <div className={styles.compositionItem}>
              <span className={styles.compositionLabel}>Discounts</span>
              <span className={styles.compositionValue}>
                {formatCurrency(revenueComposition?.discountAmount ?? 0)}
              </span>
              <span className={styles.compositionMeta}>
                {formatDecimal(revenueComposition?.discountRate ?? 0)}% ·{" "}
                {formatCompactNumber(
                  revenueComposition?.discountedOrders ?? 0,
                )}{" "}
                orders
              </span>
            </div>

            <div className={styles.compositionItem}>
              <span className={styles.compositionLabel}>Refunds</span>
              <span className={styles.compositionValue}>
                {formatCurrency(revenueComposition?.refundAmount ?? 0)}
              </span>
              <span className={styles.compositionMeta}>
                Issued in selected period
              </span>
            </div>
          </div>

          <div className={styles.compositionNote}>
            Partial payments are allocated proportionally across merchandise,
            delivery and discounts.
          </div>
        </CardContent>
      </Card>

      <div className={styles.chartsGrid} hidden={activeTab !== "products"}>
        <Card className={styles.chartCard}>
          <CardHeader>
            <CardTitle>Product Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <MultiLineChart
              series={productRevenueTrendSeries}
              height={210}
              valueFormatter={(value) =>
                formatCurrencyGBP(value, { compact: true })
              }
            />
            <div className={styles.chartFooter}>
              <span className={styles.chartTotal}>
                Top products by collected merchandise revenue
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className={styles.chartCard}>
          <CardHeader>
            <CardTitle>Product Units Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <MultiLineChart
              series={productUnitsTrendSeries}
              height={210}
              valueFormatter={(value) => formatCompactNumber(value)}
            />
            <div className={styles.chartFooter}>
              <span className={styles.chartTotal}>
                Historical units by product
              </span>
            </div>
          </CardContent>
        </Card>
      </div>


      <div className={styles.chartsGrid} hidden={activeTab !== "variants"}>
        <Card className={styles.chartCard}>
          <CardHeader>
            <CardTitle>Variant Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <MultiLineChart
              series={variantRevenueTrendSeries}
              height={210}
              valueFormatter={(value) =>
                formatCurrencyGBP(value, { compact: true })
              }
            />
            <div className={styles.chartFooter}>
              <span className={styles.chartTotal}>
                Top variants by collected merchandise revenue
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className={styles.chartCard}>
          <CardHeader>
            <CardTitle>Variant Units Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <MultiLineChart
              series={variantUnitsTrendSeries}
              height={210}
              valueFormatter={(value) => formatCompactNumber(value)}
            />
            <div className={styles.chartFooter}>
              <span className={styles.chartTotal}>
                Historical units by variant
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className={styles.chartsGrid} hidden={activeTab !== "products"}>
        <Card className={styles.chartCard}>
          <CardHeader>
            <CardTitle>Product Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={styles.metricsGrid}>
              <div className={styles.metricItem}>
                <span className={styles.metricValue}>
                  {formatCompactNumber(productTotals?.productsSold ?? 0)}
                </span>
                <span className={styles.metricLabel}>Products Sold</span>
              </div>
              <div className={styles.metricItem}>
                <span className={styles.metricValue}>
                  {formatCurrency(productTotals?.totalRevenue ?? 0)}
                </span>
                <span className={styles.metricLabel}>Product Revenue</span>
              </div>
              <div className={styles.metricItem}>
                <span className={styles.metricValue}>
                  {formatCompactNumber(productTotals?.totalUnits ?? 0)}
                </span>
                <span className={styles.metricLabel}>Product Units</span>
              </div>
            </div>

            <div className={styles.productRankingSection}>
              <div className={styles.variantHeader}>
                <span className={styles.variantTitle}>Top by Revenue</span>
                <span className={styles.variantMeta}>Collected merchandise</span>
              </div>
              <div className={styles.productRanking}>
                {productsByRevenueChart.length === 0 && !loading ? (
                  <div className={styles.emptyState}>No product sales in this period</div>
                ) : (
                  productsByRevenueChart.map((product, index) => (
                    <div key={product.productId} className={styles.rankItem}>
                      <span className={styles.rankNumber}>#{index + 1}</span>
                      <div className={styles.rankInfo}>
                        <span className={styles.rankName}>
                          {product.label}
                          {product.catalogStatus === "deleted" ? " · Deleted" : ""}
                        </span>
                        <span className={styles.rankMeta}>
                          {formatCurrency(product.revenue)} ·{" "}
                          {formatDecimal(product.revenueContributionPercent)}% revenue ·{" "}
                          {formatCompactNumber(product.orders)} orders · ASP{" "}
                          {formatCurrency(product.averageSellingPrice)}
                        </span>
                        <button
                          type="button"
                          className={styles.drilldownButton}
                          onClick={() =>
                            openProductDetail(product.productId)
                          }
                        >
                          View details
                        </button>
                      </div>
                      <div className={styles.rankBar}>
                        <div
                          className={styles.rankFill}
                          style={{
                            width: `${Math.min(
                              100,
                              product.revenueContributionPercent,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={styles.productRankingSection}>
              <div className={styles.variantHeader}>
                <span className={styles.variantTitle}>Top by Units</span>
                <span className={styles.variantMeta}>Historical units sold</span>
              </div>
              <div className={styles.productRanking}>
                {productsByUnitsChart.length === 0 && !loading ? (
                  <div className={styles.emptyState}>No product sales in this period</div>
                ) : (
                  productsByUnitsChart.map((product, index) => (
                    <div key={product.productId} className={styles.rankItem}>
                      <span className={styles.rankNumber}>#{index + 1}</span>
                      <div className={styles.rankInfo}>
                        <span className={styles.rankName}>
                          {product.label}
                          {product.catalogStatus === "deleted" ? " · Deleted" : ""}
                        </span>
                        <span className={styles.rankMeta}>
                          {formatCompactNumber(product.units)} units ·{" "}
                          {formatDecimal(product.unitContributionPercent)}% units ·{" "}
                          {formatCurrency(product.revenue)} ·{" "}
                          {formatDecimal(product.averageUnitsPerOrder)} units/order
                        </span>
                        <button
                          type="button"
                          className={styles.drilldownButton}
                          onClick={() =>
                            openProductDetail(product.productId)
                          }
                        >
                          View details
                        </button>
                      </div>
                      <div className={styles.rankBar}>
                        <div
                          className={styles.rankFill}
                          style={{
                            width: `${Math.min(
                              100,
                              product.unitContributionPercent,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={styles.productRankingSection}>
              <div className={styles.variantHeader}>
                <span className={styles.variantTitle}>Lowest by Revenue</span>
                <span className={styles.variantMeta}>Sold products only</span>
              </div>
              <div className={styles.productRanking}>
                {lowestByRevenueChart.length === 0 && !loading ? (
                  <div className={styles.emptyState}>No product sales in this period</div>
                ) : (
                  lowestByRevenueChart.map((product, index) => (
                    <div key={product.productId} className={styles.rankItem}>
                      <span className={styles.rankNumber}>#{index + 1}</span>
                      <div className={styles.rankInfo}>
                        <span className={styles.rankName}>
                          {product.label}
                          {product.catalogStatus === "deleted" ? " · Deleted" : ""}
                        </span>
                        <span className={styles.rankMeta}>
                          {formatCurrency(product.revenue)} ·{" "}
                          {formatDecimal(product.revenueContributionPercent)}% revenue ·{" "}
                          {formatCompactNumber(product.orders)} orders
                        </span>
                        <button
                          type="button"
                          className={styles.drilldownButton}
                          onClick={() =>
                            openProductDetail(product.productId)
                          }
                        >
                          View details
                        </button>
                      </div>
                      <div className={styles.rankBar}>
                        <div
                          className={styles.rankFill}
                          style={{
                            width: `${Math.min(
                              100,
                              product.revenueContributionPercent,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={styles.productRankingSection}>
              <div className={styles.variantHeader}>
                <span className={styles.variantTitle}>Lowest by Units</span>
                <span className={styles.variantMeta}>Sold products only</span>
              </div>
              <div className={styles.productRanking}>
                {lowestByUnitsChart.length === 0 && !loading ? (
                  <div className={styles.emptyState}>No product sales in this period</div>
                ) : (
                  lowestByUnitsChart.map((product, index) => (
                    <div key={product.productId} className={styles.rankItem}>
                      <span className={styles.rankNumber}>#{index + 1}</span>
                      <div className={styles.rankInfo}>
                        <span className={styles.rankName}>
                          {product.label}
                          {product.catalogStatus === "deleted" ? " · Deleted" : ""}
                        </span>
                        <span className={styles.rankMeta}>
                          {formatCompactNumber(product.units)} units ·{" "}
                          {formatDecimal(product.unitContributionPercent)}% units ·{" "}
                          {formatCurrency(product.revenue)}
                        </span>
                        <button
                          type="button"
                          className={styles.drilldownButton}
                          onClick={() =>
                            openProductDetail(product.productId)
                          }
                        >
                          View details
                        </button>
                      </div>
                      <div className={styles.rankBar}>
                        <div
                          className={styles.rankFill}
                          style={{
                            width: `${Math.min(
                              100,
                              product.unitContributionPercent,
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className={styles.chartFooter}>
              <span className={styles.chartTotal}>
                Contribution is measured against sold products in the selected period.
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className={styles.chartCard}>
          <CardHeader>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={styles.simpleList}>
              {recentOrders.length === 0 && !loading ? (
                <div className={styles.emptyState}>No recent orders</div>
              ) : (
                recentOrders.map((o) => (
                  <div key={o._id} className={styles.simpleListItem}>
                    <div className={styles.simpleListMain}>
                      <div className={styles.simpleListTitle}>{o.orderId}</div>
                      <div className={styles.simpleListSub}>
                        {getCustomerLabel(o)} · {formatDateTime(o.createdAt)}
                      </div>
                    </div>
                    <div className={styles.simpleListMeta}>
                      <Badge variant="default" size="sm">
                        {o.status}
                      </Badge>
                      <span className={styles.simpleListValue}>
                        {formatCurrency(o.total)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>



      <Card
        hidden={activeTab !== "variants"}
        className={styles.fullWidthChart}
      >
        <CardHeader>
          <CardTitle>Variant Units</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.metricsGrid}>
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatCompactNumber(variantUnitTotals?.variantsSold ?? 0)}
              </span>
              <span className={styles.metricLabel}>Variants Sold</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatCompactNumber(variantUnitTotals?.totalUnits ?? 0)}
              </span>
              <span className={styles.metricLabel}>Variant Units</span>
            </div>
          </div>

          <div className={styles.productRankingSection}>
            <div className={styles.variantHeader}>
              <span className={styles.variantTitle}>Top Variants by Units</span>
              <span className={styles.variantMeta}>
                Historical order-item snapshots
              </span>
            </div>
            <div className={styles.productRanking}>
              {variantsByUnits.length === 0 && !loading ? (
                <div className={styles.emptyState}>No variant sales</div>
              ) : (
                variantsByUnits.map((variant, index) => (
                  <div key={variant.variantId} className={styles.rankItem}>
                    <span className={styles.rankNumber}>#{index + 1}</span>
                    <div className={styles.rankInfo}>
                      <span className={styles.rankName}>
                        {variant.variantName}
                        {variant.catalogStatus === "deleted" ? " · Deleted" : ""}
                      </span>
                      <span className={styles.rankMeta}>
                        {variant.productName} · {variant.sku} ·{" "}
                        {formatCompactNumber(variant.totalUnits)} units ·{" "}
                        {formatCompactNumber(variant.orderCount)} orders ·{" "}
                        {formatDecimal(variant.averageUnitsPerOrder)} units/order
                      </span>
                      <button
                        type="button"
                        className={styles.drilldownButton}
                        onClick={() =>
                          openVariantDetail(variant.variantId)
                        }
                      >
                        View details
                      </button>
                    </div>
                    <div className={styles.rankBar}>
                      <div
                        className={styles.rankFill}
                        style={{
                          width:
                            maxVariantUnits > 0
                              ? `${Math.min(
                                  100,
                                  (variant.totalUnits / maxVariantUnits) * 100,
                                )}%`
                              : "0%",
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={styles.chartFooter}>
            <span className={styles.chartTotal}>
              Units are counted from collected orders, including partially-paid
              orders. Deleted variants remain visible from order snapshots.
            </span>
          </div>
        </CardContent>
      </Card>


      <Card
        hidden={activeTab !== "variants"}
        className={styles.fullWidthChart}
      >
        <CardHeader>
          <CardTitle>Variant Revenue</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.metricsGrid}>
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatCurrency(variantRevenueTotals?.totalRevenue ?? 0)}
              </span>
              <span className={styles.metricLabel}>Variant Revenue</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatCompactNumber(variantRevenueTotals?.variantsSold ?? 0)}
              </span>
              <span className={styles.metricLabel}>Variants Sold</span>
            </div>
          </div>

          <div className={styles.productRankingSection}>
            <div className={styles.variantHeader}>
              <span className={styles.variantTitle}>Top Variants by Revenue</span>
              <span className={styles.variantMeta}>
                Collected merchandise revenue
              </span>
            </div>
            <div className={styles.productRanking}>
              {variantsByRevenue.length === 0 && !loading ? (
                <div className={styles.emptyState}>No variant revenue</div>
              ) : (
                variantsByRevenue.map((variant, index) => (
                  <div key={variant.variantId} className={styles.rankItem}>
                    <span className={styles.rankNumber}>#{index + 1}</span>
                    <div className={styles.rankInfo}>
                      <span className={styles.rankName}>
                        {variant.variantName}
                        {variant.catalogStatus === "deleted" ? " · Deleted" : ""}
                      </span>
                      <span className={styles.rankMeta}>
                        {variant.productName} · {variant.sku} ·{" "}
                        {formatCurrency(variant.totalRevenue)} ·{" "}
                        {formatCompactNumber(variant.orderCount)} orders
                      </span>
                      <button
                        type="button"
                        className={styles.drilldownButton}
                        onClick={() =>
                          openVariantDetail(variant.variantId)
                        }
                      >
                        View details
                      </button>
                    </div>
                    <div className={styles.rankBar}>
                      <div
                        className={styles.rankFill}
                        style={{
                          width:
                            maxVariantRevenue > 0
                              ? `${Math.min(
                                  100,
                                  (variant.totalRevenue / maxVariantRevenue) * 100,
                                )}%`
                              : "0%",
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={styles.chartFooter}>
            <span className={styles.chartTotal}>
              Revenue is collected merchandise after proportional order
              discounts. Delivery and item-unattributed refunds are excluded.
            </span>
          </div>
        </CardContent>
      </Card>


      <Card
        hidden={activeTab !== "variants"}
        className={styles.fullWidthChart}
      >
        <CardHeader><CardTitle>Variant Realised Selling Price</CardTitle></CardHeader>
        <CardContent>
          <div className={styles.metricsGrid}>
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatCurrency(variantRealisedPrice?.totals.realisedSellingPrice ?? 0)}
              </span>
              <span className={styles.metricLabel}>Overall Realised ASP</span>
            </div>
          </div>
          <div className={styles.productRankingSection}>
            <div className={styles.variantHeader}>
              <span className={styles.variantTitle}>Realised Price by Variant</span>
              <span className={styles.variantMeta}>Collected revenue ÷ historical units</span>
            </div>
            <div className={styles.productRanking}>
              {(variantPriceComparison?.variants ?? []).length === 0 && !loading ? (
                <div className={styles.emptyState}>No realised price data</div>
              ) : (
                (variantPriceComparison?.variants ?? []).map((variant, index) => (
                  <div key={variant.variantId} className={styles.rankItem}>
                    <span className={styles.rankNumber}>#{index + 1}</span>
                    <div className={styles.rankInfo}>
                      <span className={styles.rankName}>
                        {variant.variantName}
                        {variant.catalogStatus === "deleted" ? " · Deleted" : ""}
                      </span>
                      <span className={styles.rankMeta}>
                        {variant.productName} · {variant.sku} ·{" "}
                        Realised {formatCurrency(variant.realisedSellingPrice)} / unit ·{" "}
                        {variant.currentPrice === null ? (
                          <>Current price unavailable</>
                        ) : (
                          <>
                            Current {formatCurrency(variant.currentPrice)} ·{" "}
                            Difference {formatCurrency(variant.priceDifference ?? 0)}{" "}
                            ({formatDecimal(variant.priceDifferencePercent ?? 0)}%)
                          </>
                        )}{" "}
                        · {formatCompactNumber(variant.totalUnits)} units
                      </span>
                      <button
                        type="button"
                        className={styles.drilldownButton}
                        onClick={() => openVariantDetail(variant.variantId)}
                      >
                        View details
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className={styles.chartFooter}>
            <span className={styles.chartTotal}>
              Realised price reflects discounts and partial payments. Current price is the live catalog price at request time; deleted variants remain historically visible with comparison unavailable.
            </span>
          </div>
        </CardContent>
      </Card>


      <Card
        hidden={activeTab !== "variants"}
        className={styles.fullWidthChart}
      >
        <CardHeader>
          <CardTitle>Variant Subscription vs One-Time</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.metricsGrid}>
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatCurrency(variantSalesMix?.totals.oneTime.revenue ?? 0)}
              </span>
              <span className={styles.metricLabel}>
                Website One-Time · {formatCompactNumber(variantSalesMix?.totals.oneTime.units ?? 0)} units
              </span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatCurrency(variantSalesMix?.totals.subscription.revenue ?? 0)}
              </span>
              <span className={styles.metricLabel}>
                Subscription · {formatCompactNumber(variantSalesMix?.totals.subscription.units ?? 0)} units
              </span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatCurrency(variantSalesMix?.totals.importedExcluded.revenue ?? 0)}
              </span>
              <span className={styles.metricLabel}>
                Imported Excluded · {formatCompactNumber(variantSalesMix?.totals.importedExcluded.units ?? 0)} units
              </span>
            </div>
          </div>

          <div className={styles.productRankingSection}>
            <div className={styles.variantHeader}>
              <span className={styles.variantTitle}>Variant Sales Mix</span>
              <span className={styles.variantMeta}>
                Website One-Time vs Subscription
              </span>
            </div>
            <div className={styles.productRanking}>
              {(variantSalesMix?.variants ?? []).length === 0 && !loading ? (
                <div className={styles.emptyState}>
                  No one-time or subscription variant sales
                </div>
              ) : (
                (variantSalesMix?.variants ?? []).map((variant, index) => (
                  <div key={variant.variantId} className={styles.rankItem}>
                    <span className={styles.rankNumber}>#{index + 1}</span>
                    <div className={styles.rankInfo}>
                      <span className={styles.rankName}>
                        {variant.variantName}
                        {variant.catalogStatus === "deleted" ? " · Deleted" : ""}
                      </span>
                      <span className={styles.rankMeta}>
                        {variant.productName} · {variant.sku}
                      </span>
                      <span className={styles.rankMeta}>
                        One-Time {formatCurrency(variant.oneTime.revenue)} ·{" "}
                        {formatCompactNumber(variant.oneTime.units)} units ·{" "}
                        {formatCompactNumber(variant.oneTime.orders)} orders
                      </span>
                      <span className={styles.rankMeta}>
                        Subscription {formatCurrency(variant.subscription.revenue)} ·{" "}
                        {formatCompactNumber(variant.subscription.units)} units ·{" "}
                        {formatCompactNumber(variant.subscription.orders)} orders
                      </span>
                      <button
                        type="button"
                        className={styles.drilldownButton}
                        onClick={() => openVariantDetail(variant.variantId)}
                      >
                        View details
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={styles.chartFooter}>
            <span className={styles.chartTotal}>
              Imported/manual orders are excluded from the one-time vs subscription comparison and shown separately above.
            </span>
          </div>
        </CardContent>
      </Card>


      <Card
        hidden={activeTab !== "variants"}
        className={styles.fullWidthChart}
      >
        <CardHeader>
          <CardTitle>Variant Contribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.metricsGrid}>
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatCurrency(variantContribution?.totals.totalRevenue ?? 0)}
              </span>
              <span className={styles.metricLabel}>Variant Revenue Base</span>
            </div>
            <div className={styles.metricItem}>
              <span className={styles.metricValue}>
                {formatCompactNumber(variantContribution?.totals.totalUnits ?? 0)}
              </span>
              <span className={styles.metricLabel}>Variant Unit Base</span>
            </div>
          </div>

          <div className={styles.productRankingSection}>
            <div className={styles.variantHeader}>
              <span className={styles.variantTitle}>Revenue Contribution</span>
              <span className={styles.variantMeta}>Share of selected-period variant revenue</span>
            </div>
            <div className={styles.productRanking}>
              {(variantContribution?.byRevenue ?? []).length === 0 && !loading ? (
                <div className={styles.emptyState}>No variant contribution data</div>
              ) : (
                (variantContribution?.byRevenue ?? []).map((variant, index) => (
                  <div key={variant.variantId} className={styles.rankItem}>
                    <span className={styles.rankNumber}>#{index + 1}</span>
                    <div className={styles.rankInfo}>
                      <span className={styles.rankName}>
                        {variant.variantName}
                        {variant.catalogStatus === "deleted" ? " · Deleted" : ""}
                      </span>
                      <span className={styles.rankMeta}>
                        {variant.productName} · {variant.sku} ·{" "}
                        {formatCurrency(variant.totalRevenue)} ·{" "}
                        {formatDecimal(variant.revenueContributionPercent)}% revenue
                      </span>
                      <button
                        type="button"
                        className={styles.drilldownButton}
                        onClick={() => openVariantDetail(variant.variantId)}
                      >
                        View details
                      </button>
                    </div>
                    <div className={styles.rankBar}>
                      <div
                        className={styles.rankFill}
                        style={{
                          width: `${Math.min(100, variant.revenueContributionPercent)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={styles.productRankingSection}>
            <div className={styles.variantHeader}>
              <span className={styles.variantTitle}>Unit Contribution</span>
              <span className={styles.variantMeta}>Share of selected-period variant units</span>
            </div>
            <div className={styles.productRanking}>
              {(variantContribution?.byUnits ?? []).length === 0 && !loading ? (
                <div className={styles.emptyState}>No variant contribution data</div>
              ) : (
                (variantContribution?.byUnits ?? []).map((variant, index) => (
                  <div key={variant.variantId} className={styles.rankItem}>
                    <span className={styles.rankNumber}>#{index + 1}</span>
                    <div className={styles.rankInfo}>
                      <span className={styles.rankName}>
                        {variant.variantName}
                        {variant.catalogStatus === "deleted" ? " · Deleted" : ""}
                      </span>
                      <span className={styles.rankMeta}>
                        {variant.productName} · {variant.sku} ·{" "}
                        {formatCompactNumber(variant.totalUnits)} units ·{" "}
                        {formatDecimal(variant.unitContributionPercent)}% units
                      </span>
                      <button
                        type="button"
                        className={styles.drilldownButton}
                        onClick={() => openVariantDetail(variant.variantId)}
                      >
                        View details
                      </button>
                    </div>
                    <div className={styles.rankBar}>
                      <div
                        className={styles.rankFill}
                        style={{
                          width: `${Math.min(100, variant.unitContributionPercent)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className={styles.chartFooter}>
            <span className={styles.chartTotal}>
              Contribution uses all sold variants in the selected period as the denominator, even when the displayed ranking is limited.
            </span>
          </div>
        </CardContent>
      </Card>

      <Card
        hidden={activeTab !== "data"}
        className={styles.fullWidthChart}
      >
        <CardHeader>
          <div className={styles.exportCardHeader}>
            <div>
              <CardTitle>Export-ready Tables</CardTitle>
              <div className={styles.productDetailSubheading}>
                Rows reflect the currently loaded dashboard view and selected filters.
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className={styles.exportTableStack}>
            <section className={styles.exportTableSection}>
              <div className={styles.exportTableHeader}>
                <div>
                  <div className={styles.exportTableTitle}>Sales Channels</div>
                  <div className={styles.exportTableNote}>
                    Complete website, subscription, and imported channel breakdown.
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<Download size={14} />}
                  disabled={salesChannels.length === 0}
                  onClick={exportSalesChannels}
                >
                  Export CSV
                </Button>
              </div>
              {salesChannels.length === 0 ? (
                <div className={styles.emptyState}>No sales-channel rows to export</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead align="right">Net Revenue</TableHead>
                      <TableHead align="right">Gross</TableHead>
                      <TableHead align="right">Refunds</TableHead>
                      <TableHead align="right">Orders</TableHead>
                      <TableHead align="right">Units</TableHead>
                      <TableHead align="right">AOV</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salesChannels.map((channel) => (
                      <TableRow key={channel.key}>
                        <TableCell>{channel.label}</TableCell>
                        <TableCell align="right">
                          {formatCurrency(channel.netRevenue)}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(channel.grossRevenue)}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(channel.refundAmount)}
                        </TableCell>
                        <TableCell align="right">
                          {formatCompactNumber(channel.totalOrders)}
                        </TableCell>
                        <TableCell align="right">
                          {formatCompactNumber(channel.unitsSold)}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(channel.averageOrderValue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>

            <section className={styles.exportTableSection}>
              <div className={styles.exportTableHeader}>
                <div>
                  <div className={styles.exportTableTitle}>Product Performance</div>
                  <div className={styles.exportTableNote}>
                    Current product revenue ranking from the dashboard query.
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<Download size={14} />}
                  disabled={productsByRevenueChart.length === 0}
                  onClick={exportProducts}
                >
                  Export CSV
                </Button>
              </div>
              {productsByRevenueChart.length === 0 ? (
                <div className={styles.emptyState}>No product rows to export</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead align="right">Revenue</TableHead>
                      <TableHead align="right">Units</TableHead>
                      <TableHead align="right">Orders</TableHead>
                      <TableHead align="right">ASP</TableHead>
                      <TableHead align="right">Revenue %</TableHead>
                      <TableHead align="right">Units %</TableHead>
                      <TableHead align="right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productsByRevenueChart.map((product) => (
                      <TableRow key={String(product.productId)}>
                        <TableCell>{product.label}</TableCell>
                        <TableCell>{product.catalogStatus}</TableCell>
                        <TableCell align="right">
                          {formatCurrency(product.revenue)}
                        </TableCell>
                        <TableCell align="right">
                          {formatCompactNumber(product.units)}
                        </TableCell>
                        <TableCell align="right">
                          {formatCompactNumber(product.orders)}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(product.averageSellingPrice)}
                        </TableCell>
                        <TableCell align="right">
                          {formatDecimal(product.revenueContributionPercent)}%
                        </TableCell>
                        <TableCell align="right">
                          {formatDecimal(product.unitContributionPercent)}%
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openProductDetail(product.productId)}
                          >
                            View details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>

            <section className={styles.exportTableSection}>
              <div className={styles.exportTableHeader}>
                <div>
                  <div className={styles.exportTableTitle}>Variant Performance</div>
                  <div className={styles.exportTableNote}>
                    Current variant revenue ranking with historical identity.
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<Download size={14} />}
                  disabled={variantsByRevenue.length === 0}
                  onClick={exportVariants}
                >
                  Export CSV
                </Button>
              </div>
              {variantsByRevenue.length === 0 ? (
                <div className={styles.emptyState}>No variant rows to export</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Variant</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead align="right">Revenue</TableHead>
                      <TableHead align="right">Units</TableHead>
                      <TableHead align="right">Orders</TableHead>
                      <TableHead align="right">Realised ASP</TableHead>
                      <TableHead align="right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {variantsByRevenue.map((variant) => (
                      <TableRow key={String(variant.variantId)}>
                        <TableCell>{variant.productName}</TableCell>
                        <TableCell>{variant.variantName}</TableCell>
                        <TableCell>{variant.sku}</TableCell>
                        <TableCell>{variant.catalogStatus}</TableCell>
                        <TableCell align="right">
                          {formatCurrency(variant.totalRevenue)}
                        </TableCell>
                        <TableCell align="right">
                          {formatCompactNumber(variant.totalUnits)}
                        </TableCell>
                        <TableCell align="right">
                          {formatCompactNumber(variant.orderCount)}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(variant.realisedSellingPrice)}
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => openVariantDetail(variant.variantId)}
                          >
                            View details
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>

            <section className={styles.exportTableSection}>
              <div className={styles.exportTableHeader}>
                <div>
                  <div className={styles.exportTableTitle}>Recent Orders</div>
                  <div className={styles.exportTableNote}>
                    The recent-order rows included in the current dashboard response.
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<Download size={14} />}
                  disabled={recentOrders.length === 0}
                  onClick={exportRecentOrders}
                >
                  Export CSV
                </Button>
              </div>
              {recentOrders.length === 0 ? (
                <div className={styles.emptyState}>No recent orders to export</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead align="right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentOrders.map((order) => (
                      <TableRow key={order._id}>
                        <TableCell>{order.orderId}</TableCell>
                        <TableCell>{getCustomerLabel(order)}</TableCell>
                        <TableCell>{order.status}</TableCell>
                        <TableCell>{formatDateTime(order.createdAt)}</TableCell>
                        <TableCell align="right">
                          {formatCurrency(order.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </section>
          </div>
        </CardContent>
      </Card>

      {selectedVariantId && activeTab === "variants" ? (
        <Card
          id="variant-analytics-detail"
          className={styles.fullWidthChart}
        >
          <CardHeader>
            <div className={styles.productDetailHeader}>
              <div>
                <CardTitle>
                  {variantDetail?.variantName || "Variant Detail"}
                  {variantDetail?.catalogStatus === "deleted"
                    ? " · Deleted"
                    : ""}
                </CardTitle>
                <div className={styles.productDetailSubheading}>
                  {variantDetail
                    ? `${variantDetail.productName} · ${variantDetail.sku}`
                    : "Historical variant performance for the selected filters"}
                </div>
              </div>
              <button
                type="button"
                className={styles.drilldownButton}
                onClick={() => setSelectedVariantId(null)}
              >
                Close
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {variantDetailLoading ? (
              <div className={styles.emptyState}>Loading variant detail…</div>
            ) : variantDetailError ? (
              <AnalyticsStatePanel
                kind="error"
                title="Variant detail could not be loaded"
                message={variantDetailError}
                onRetry={() =>
                  setVariantDetailRetryKey((current) => current + 1)
                }
              />
            ) : variantDetail ? (
              <>
                <div className={styles.metricsGrid}>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>
                      {formatCurrency(variantDetail.totalRevenue)}
                    </span>
                    <span className={styles.metricLabel}>Variant Revenue</span>
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>
                      {formatCompactNumber(variantDetail.totalUnits)}
                    </span>
                    <span className={styles.metricLabel}>Units</span>
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>
                      {formatCompactNumber(variantDetail.totalOrders)}
                    </span>
                    <span className={styles.metricLabel}>Unique Orders</span>
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>
                      {formatCurrency(variantDetail.realisedSellingPrice)}
                    </span>
                    <span className={styles.metricLabel}>Realised ASP</span>
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>
                      {variantDetail.currentPrice === null
                        ? "—"
                        : formatCurrency(variantDetail.currentPrice)}
                    </span>
                    <span className={styles.metricLabel}>Current Price</span>
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>
                      {variantDetail.priceDifference === null
                        ? "—"
                        : formatCurrency(variantDetail.priceDifference)}
                    </span>
                    <span className={styles.metricLabel}>
                      Realised vs Current
                    </span>
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>
                      {formatDecimal(variantDetail.revenueContributionPercent)}%
                    </span>
                    <span className={styles.metricLabel}>
                      Revenue Contribution
                    </span>
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>
                      {formatDecimal(variantDetail.unitContributionPercent)}%
                    </span>
                    <span className={styles.metricLabel}>Unit Contribution</span>
                  </div>
                </div>

                <div className={styles.chartsGrid}>
                  <div className={styles.productDetailSection}>
                    <div className={styles.variantHeader}>
                      <span className={styles.variantTitle}>Revenue Trend</span>
                      <span className={styles.variantMeta}>
                        {variantDetail.trend.interval}
                      </span>
                    </div>
                    <SimpleBarChart
                      type="line"
                      height={220}
                      color="success"
                      data={variantDetail.trend.points.map((point) => ({
                        label: point.label,
                        value: point.revenue,
                      }))}
                      valueFormatter={(value) =>
                        formatCurrencyGBP(value, { compact: true })
                      }
                    />
                  </div>
                  <div className={styles.productDetailSection}>
                    <div className={styles.variantHeader}>
                      <span className={styles.variantTitle}>Units Trend</span>
                      <span className={styles.variantMeta}>Historical units</span>
                    </div>
                    <SimpleBarChart
                      type="bar"
                      height={220}
                      color="info"
                      data={variantDetail.trend.points.map((point) => ({
                        label: point.label,
                        value: point.units,
                      }))}
                      valueFormatter={(value) => formatCompactNumber(value)}
                    />
                  </div>
                </div>

                <div className={styles.chartsGrid}>
                  <div className={styles.productDetailSection}>
                    <div className={styles.variantHeader}>
                      <span className={styles.variantTitle}>Orders Trend</span>
                      <span className={styles.variantMeta}>Unique orders</span>
                    </div>
                    <SimpleBarChart
                      type="bar"
                      height={200}
                      color="primary"
                      data={variantDetail.trend.points.map((point) => ({
                        label: point.label,
                        value: point.orders,
                      }))}
                      valueFormatter={(value) => formatCompactNumber(value)}
                    />
                  </div>
                  <div className={styles.productDetailSection}>
                    <div className={styles.variantHeader}>
                      <span className={styles.variantTitle}>
                        Realised ASP Trend
                      </span>
                      <span className={styles.variantMeta}>Revenue / units</span>
                    </div>
                    <SimpleBarChart
                      type="line"
                      height={200}
                      color="primary"
                      data={variantDetail.trend.points.map((point) => ({
                        label: point.label,
                        value: point.realisedSellingPrice,
                      }))}
                      valueFormatter={(value) =>
                        formatCurrencyGBP(value, { compact: true })
                      }
                    />
                  </div>
                </div>

                <div className={styles.productDetailSection}>
                  <div className={styles.variantHeader}>
                    <span className={styles.variantTitle}>Sales by Source</span>
                    <span className={styles.variantMeta}>
                      Mutually exclusive channels
                    </span>
                  </div>
                  <div className={styles.salesMixGrid}>
                    {variantDetail.sourceSplit.map((source) => (
                      <div key={source.key} className={styles.salesMixCard}>
                        <div className={styles.salesMixHeader}>
                          <span className={styles.salesMixTitle}>
                            {source.label}
                          </span>
                          <span className={styles.salesMixShare}>
                            {formatDecimal(source.revenueContributionPercent)}%
                            revenue
                          </span>
                        </div>
                        <div className={styles.salesMixPrimary}>
                          {formatCurrency(source.revenue)}
                        </div>
                        <div className={styles.salesMixStats}>
                          <div>
                            <span className={styles.salesMixStatValue}>
                              {formatCompactNumber(source.units)}
                            </span>
                            <span className={styles.salesMixStatLabel}>Units</span>
                          </div>
                          <div>
                            <span className={styles.salesMixStatValue}>
                              {formatCompactNumber(source.orders)}
                            </span>
                            <span className={styles.salesMixStatLabel}>Orders</span>
                          </div>
                          <div>
                            <span className={styles.salesMixStatValue}>
                              {formatCurrency(source.realisedSellingPrice)}
                            </span>
                            <span className={styles.salesMixStatLabel}>ASP</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.compositionNote}>
                  {variantDetail.metricBasis.identity}
                </div>
              </>
            ) : (
              <div className={styles.emptyState}>No variant detail</div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {selectedProductId && activeTab === "products" ? (
        <Card
          id="product-analytics-detail"
          className={styles.fullWidthChart}
        >
          <CardHeader>
            <div className={styles.productDetailHeader}>
              <div>
                <CardTitle>
                  {productDetail?.productName || "Product Detail"}
                  {productDetail?.catalogStatus === "deleted"
                    ? " · Deleted"
                    : ""}
                </CardTitle>
                <div className={styles.productDetailSubheading}>
                  Historical product performance for the selected filters
                </div>
              </div>
              <button
                type="button"
                className={styles.drilldownButton}
                onClick={() => setSelectedProductId(null)}
              >
                Close
              </button>
            </div>
          </CardHeader>
          <CardContent>
            {productDetailLoading ? (
              <div className={styles.emptyState}>Loading product detail…</div>
            ) : productDetailError ? (
              <AnalyticsStatePanel
                kind="error"
                title="Product detail could not be loaded"
                message={productDetailError}
                onRetry={() =>
                  setProductDetailRetryKey((current) => current + 1)
                }
              />
            ) : productDetail ? (
              <>
                <div className={styles.metricsGrid}>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>
                      {formatCurrency(productDetail.totalRevenue)}
                    </span>
                    <span className={styles.metricLabel}>Product Revenue</span>
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>
                      {formatCompactNumber(productDetail.totalUnits)}
                    </span>
                    <span className={styles.metricLabel}>Units</span>
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>
                      {formatCompactNumber(productDetail.totalOrders)}
                    </span>
                    <span className={styles.metricLabel}>Unique Orders</span>
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>
                      {formatCurrency(productDetail.averageSellingPrice)}
                    </span>
                    <span className={styles.metricLabel}>Realised ASP</span>
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>
                      {formatCurrency(productDetail.averageRevenuePerOrder)}
                    </span>
                    <span className={styles.metricLabel}>Avg Revenue / Order</span>
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>
                      {formatDecimal(productDetail.averageUnitsPerOrder)}
                    </span>
                    <span className={styles.metricLabel}>Avg Units / Order</span>
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>
                      {formatDecimal(productDetail.revenueContributionPercent)}%
                    </span>
                    <span className={styles.metricLabel}>
                      Revenue Contribution
                    </span>
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>
                      {formatDecimal(productDetail.unitContributionPercent)}%
                    </span>
                    <span className={styles.metricLabel}>Unit Contribution</span>
                  </div>
                </div>

                <div className={styles.chartsGrid}>
                  <div className={styles.productDetailSection}>
                    <div className={styles.variantHeader}>
                      <span className={styles.variantTitle}>Revenue Trend</span>
                      <span className={styles.variantMeta}>
                        {productDetail.trend.interval}
                      </span>
                    </div>
                    <SimpleBarChart
                      type="line"
                      height={220}
                      color="success"
                      data={productDetail.trend.points.map((point) => ({
                        label: point.label,
                        value: point.revenue,
                      }))}
                      valueFormatter={(value) =>
                        formatCurrencyGBP(value, { compact: true })
                      }
                    />
                  </div>
                  <div className={styles.productDetailSection}>
                    <div className={styles.variantHeader}>
                      <span className={styles.variantTitle}>Units Trend</span>
                      <span className={styles.variantMeta}>Historical units</span>
                    </div>
                    <SimpleBarChart
                      type="bar"
                      height={220}
                      color="info"
                      data={productDetail.trend.points.map((point) => ({
                        label: point.label,
                        value: point.units,
                      }))}
                      valueFormatter={(value) => formatCompactNumber(value)}
                    />
                  </div>
                </div>

                <div className={styles.chartsGrid}>
                  <div className={styles.productDetailSection}>
                    <div className={styles.variantHeader}>
                      <span className={styles.variantTitle}>Orders Trend</span>
                      <span className={styles.variantMeta}>Unique orders</span>
                    </div>
                    <SimpleBarChart
                      type="bar"
                      height={200}
                      color="primary"
                      data={productDetail.trend.points.map((point) => ({
                        label: point.label,
                        value: point.orders,
                      }))}
                      valueFormatter={(value) => formatCompactNumber(value)}
                    />
                  </div>
                  <div className={styles.productDetailSection}>
                    <div className={styles.variantHeader}>
                      <span className={styles.variantTitle}>Realised ASP Trend</span>
                      <span className={styles.variantMeta}>Revenue / units</span>
                    </div>
                    <SimpleBarChart
                      type="line"
                      height={200}
                      color="primary"
                      data={productDetail.trend.points.map((point) => ({
                        label: point.label,
                        value: point.averageSellingPrice,
                      }))}
                      valueFormatter={(value) =>
                        formatCurrencyGBP(value, { compact: true })
                      }
                    />
                  </div>
                </div>

                <div className={styles.productDetailSection}>
                  <div className={styles.variantHeader}>
                    <span className={styles.variantTitle}>Sales by Source</span>
                    <span className={styles.variantMeta}>
                      Mutually exclusive channels
                    </span>
                  </div>
                  <div className={styles.salesMixGrid}>
                    {productDetail.sourceSplit.map((source) => (
                      <div key={source.key} className={styles.salesMixCard}>
                        <div className={styles.salesMixHeader}>
                          <span className={styles.salesMixTitle}>
                            {source.label}
                          </span>
                          <span className={styles.salesMixShare}>
                            {formatDecimal(source.revenueContributionPercent)}% revenue
                          </span>
                        </div>
                        <div className={styles.salesMixPrimary}>
                          {formatCurrency(source.revenue)}
                        </div>
                        <div className={styles.salesMixStats}>
                          <div>
                            <span className={styles.salesMixStatValue}>
                              {formatCompactNumber(source.units)}
                            </span>
                            <span className={styles.salesMixStatLabel}>Units</span>
                          </div>
                          <div>
                            <span className={styles.salesMixStatValue}>
                              {formatCompactNumber(source.orders)}
                            </span>
                            <span className={styles.salesMixStatLabel}>Orders</span>
                          </div>
                          <div>
                            <span className={styles.salesMixStatValue}>
                              {formatCurrency(source.averageSellingPrice)}
                            </span>
                            <span className={styles.salesMixStatLabel}>ASP</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className={styles.productDetailSection}>
                  <div className={styles.variantHeader}>
                    <span className={styles.variantTitle}>Variants</span>
                    <span className={styles.variantMeta}>
                      Historical order snapshots
                    </span>
                  </div>
                  {productDetail.variants.length === 0 ? (
                    <div className={styles.emptyState}>
                      No product sales in this period
                    </div>
                  ) : (
                    <div className={styles.variantBlock}>
                      {productDetail.variants.map((variant) => (
                        <div
                          key={String(variant.variantId)}
                          className={styles.variantCard}
                        >
                          <div className={styles.variantHeader}>
                            <span className={styles.variantTitle}>
                              {variant.name || "Historical variant"}
                            </span>
                            <span className={styles.variantMeta}>
                              {variant.sku || "No SKU"}
                            </span>
                            <button
                              type="button"
                              className={styles.drilldownButton}
                              onClick={() => openVariantDetail(variant.variantId)}
                            >
                              View variant
                            </button>
                          </div>
                          <div className={styles.variantList}>
                            <div className={styles.variantItem}>
                              <span>Revenue</span>
                              <span className={styles.variantRevenue}>
                                {formatCurrency(variant.revenue)}
                              </span>
                            </div>
                            <div className={styles.variantItem}>
                              <span>Units</span>
                              <span className={styles.variantQty}>
                                {formatCompactNumber(variant.quantity)}
                              </span>
                            </div>
                            <div className={styles.variantItem}>
                              <span>Orders</span>
                              <span className={styles.variantQty}>
                                {formatCompactNumber(variant.orderCount)}
                              </span>
                            </div>
                            <div className={styles.variantItem}>
                              <span>Realised ASP</span>
                              <span className={styles.variantRevenue}>
                                {formatCurrency(variant.averageSellingPrice)}
                              </span>
                            </div>
                            <div className={styles.variantItem}>
                              <span>Revenue Contribution</span>
                              <span className={styles.variantQty}>
                                {formatDecimal(variant.revenueContributionPercent)}%
                              </span>
                            </div>
                            <div className={styles.variantItem}>
                              <span>Unit Contribution</span>
                              <span className={styles.variantQty}>
                                {formatDecimal(variant.unitContributionPercent)}%
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className={styles.compositionNote}>
                  {productDetail.metricBasis.revenue}
                </div>
              </>
            ) : (
              <div className={styles.emptyState}>No product detail</div>
            )}
          </CardContent>
        </Card>
      ) : null}
      </div>

      <Card
        hidden={activeTab !== "data"}
        className={styles.inventoryCard}
      >
        <CardHeader>
          <CardTitle>Low Stock Alert</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.inventoryGrid}>
            {(lowStockItems || []).slice(0, 12).map((item) => (
              <div key={item._id} className={styles.inventoryItem}>
                <div className={styles.inventoryHeader}>
                  <span className={styles.inventoryName}>
                    {item.product?.name ? `${item.product.name} · ` : ""}
                    {item.name}
                  </span>
                  <Badge variant="error" size="sm">
                    Low Stock
                  </Badge>
                </div>
                <div className={styles.inventoryBar}>
                  <div
                    className={`${styles.inventoryFill} ${styles.low}`}
                    style={{ width: "100%" }}
                  />
                </div>
                <span className={styles.inventoryCount}>
                  Available: {item.available} · Alert: {item.lowStockAlert} ·
                  SKU: {item.sku}
                </span>
              </div>
            ))}
          </div>

          {lowStockItems.length === 0 && !loading ? (
            <div className={styles.emptyState}>
              No variants are currently below their low-stock threshold
            </div>
          ) : null}
        </CardContent>
      </Card>
        </div>
      ) : null}
    </div>
  );
};

export default Reports;
