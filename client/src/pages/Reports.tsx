import { useEffect, useMemo, useState } from "react";
import {
  DollarSign,
  ShoppingCart,
  Package,
  BarChart3,
} from "lucide-react";

import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Select,
  Badge,
} from "../components/common";
import {
  SimpleBarChart,
  MultiLineChart,
  DonutChart,
} from "../components/charts";

import {
  useAnalyticsApi,
  type AnalyticsDateRange,
  type AnalyticsOrderSource,
  type AnalyticsMetricChange,
  type ProductDetail,
  type VariantDetail,
  type RevenueInterval,
} from "../context/Analytics";

import styles from "./Reports.module.css";

import { formatCurrencyGBP, formatCompactNumber } from "../lib/numberFormat";

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

const KpiTrend = ({ change }: { change?: AnalyticsMetricChange }) => {
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
      <span className={styles.trendLabel}>vs previous period</span>
    </span>
  );
};

const defaultIntervalForRange = (
  range: AnalyticsDateRange,
): RevenueInterval => {
  if (range === "today" || range === "yesterday" || range === "last7") {
    return "day";
  }
  if (range === "last30" || range === "thisMonth" || range === "lastMonth") {
    return "week";
  }
  if (range === "thisYear" || range === "lastYear" || range === "all") {
    return "month";
  }
  return "day";
};

const PRODUCT_TREND_COLORS = ["primary", "success", "info"] as const;

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

  useEffect(() => {
    const isCustom = range === "custom";
    if (isCustom && (!from || !to)) return;

    void getDashboard({
      interval,
      orderSource,
      ...(isCustom ? { from, to } : { range }),
    });
  }, [range, orderSource, from, to, interval, getDashboard]);

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
    getVariantDetail,
  ]);

  const dateRangeOptions: { value: AnalyticsDateRange; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "last7", label: "Last 7 Days" },
    { value: "last30", label: "Last 30 Days" },
    { value: "thisMonth", label: "This Month" },
    { value: "lastMonth", label: "Last Month" },
    { value: "thisYear", label: "This Year" },
    { value: "lastYear", label: "Last Year" },
    { value: "all", label: "All Time" },
    { value: "custom", label: "Custom" },
  ];

  const intervalOptions: { value: RevenueInterval; label: string }[] = [
    { value: "day", label: "Daily" },
    { value: "week", label: "Weekly" },
    { value: "month", label: "Monthly" },
    { value: "year", label: "Yearly" },
  ];

  const orderSourceOptions: {
    value: AnalyticsOrderSource;
    label: string;
  }[] = [
    { value: "all", label: "All Sources" },
    { value: "website", label: "Website" },
    { value: "subscription", label: "Subscription" },
    { value: "imported", label: "Imported" },
  ];

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
  const newSubscriptions = dashboard?.newSubscriptions;

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

  return (
    <div className={styles.reports}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Analytics</h1>
          <p className={styles.subtitle}>Business performance overview</p>
        </div>

        <div className={styles.headerActions}>
          <Select
            value={range}
            onChange={(value) =>
              setFilters({
                range: value as AnalyticsDateRange,
                orderSource,
                interval: defaultIntervalForRange(
                  value as AnalyticsDateRange,
                ),
              })
            }
            options={dateRangeOptions}
          />

          <Select
            value={orderSource}
            onChange={(value) =>
              setFilters({
                range,
                orderSource: value as AnalyticsOrderSource,
                interval,
              })
            }
            options={orderSourceOptions}
          />

          <Select
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
            options={intervalOptions}
          />

          {range === "custom" ? (
            <div className={styles.customDateRow}>
              <input
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

      {error ? <div className={styles.errorBanner}>{error}</div> : null}

      <div className={styles.kpiGrid}>
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
              <KpiTrend change={overviewChanges?.netRevenue} />
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
              <KpiTrend change={overviewChanges?.grossRevenue} />
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
              <KpiTrend change={overviewChanges?.totalOrders} />
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
              <KpiTrend change={overviewChanges?.unitsSold} />
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
              <KpiTrend change={overviewChanges?.averageOrderValue} />
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
              <KpiTrend change={overviewChanges?.averageUnitsPerOrder} />
            </div>
          </div>
        </Card>
      </div>

      <Card className={styles.fullWidthChart}>
        <CardHeader>
          <CardTitle>Subscription Analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.metricsGrid}>
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
                {formatCompactNumber(newSubscriptions?.newSubscriptions ?? 0)}
              </span>
              <span className={styles.metricLabel}>New Subscriptions</span>
            </div>
          </div>
          <div className={styles.chartFooter}>
            <span className={styles.chartTotal}>
              Active is current recurring state and ignores historical filters.
              New subscriptions use the selected date range. Order-source
              filters do not apply to either lifecycle metric.
            </span>
          </div>
        </CardContent>
      </Card>

      <div className={styles.chartsGrid}>
        <Card className={styles.chartCard}>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart
              data={revenueChartData}
              type="line"
              height={240}
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

      <Card className={styles.fullWidthChart}>
        <CardHeader>
          <CardTitle>Orders Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleBarChart
            data={ordersChartData}
            type="bar"
            height={220}
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

      <Card className={styles.fullWidthChart}>
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

      <Card className={styles.fullWidthChart}>
        <CardHeader>
          <CardTitle>Sales Channel Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <MultiLineChart
            series={salesTrendSeries}
            height={260}
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

      <Card className={styles.fullWidthChart}>
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

      <div className={styles.chartsGrid}>
        <Card className={styles.chartCard}>
          <CardHeader>
            <CardTitle>Product Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <MultiLineChart
              series={productRevenueTrendSeries}
              height={250}
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
              height={250}
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


      <div className={styles.chartsGrid}>
        <Card className={styles.chartCard}>
          <CardHeader>
            <CardTitle>Variant Revenue Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <MultiLineChart
              series={variantRevenueTrendSeries}
              height={250}
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
              height={250}
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

      <div className={styles.chartsGrid}>
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
                  <div className={styles.emptyState}>No data</div>
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
                            setSelectedProductId(String(product.productId))
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
                  <div className={styles.emptyState}>No data</div>
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
                            setSelectedProductId(String(product.productId))
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
                  <div className={styles.emptyState}>No data</div>
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
                            setSelectedProductId(String(product.productId))
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
                  <div className={styles.emptyState}>No data</div>
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
                            setSelectedProductId(String(product.productId))
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



      <Card className={styles.fullWidthChart}>
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
                          setSelectedVariantId(String(variant.variantId))
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


      <Card className={styles.fullWidthChart}>
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
                          setSelectedVariantId(String(variant.variantId))
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


      <Card className={styles.fullWidthChart}>
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


      <Card className={styles.fullWidthChart}>
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


      <Card className={styles.fullWidthChart}>
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

      {selectedVariantId ? (
        <Card className={styles.fullWidthChart}>
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
              <div className={styles.errorBanner}>{variantDetailError}</div>
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

      {selectedProductId ? (
        <Card className={styles.fullWidthChart}>
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
              <div className={styles.errorBanner}>{productDetailError}</div>
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

      <Card>
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

          {loading && !dashboard ? (
            <div className={styles.emptyState}>Loading…</div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
