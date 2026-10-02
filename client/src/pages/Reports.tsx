import { useEffect, useMemo } from "react";
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
  } = useAnalyticsApi();

  useEffect(() => {
    const isCustom = range === "custom";
    if (isCustom && (!from || !to)) return;

    void getDashboard({
      interval,
      orderSource,
      ...(isCustom ? { from, to } : { range }),
    });
  }, [range, orderSource, from, to, interval, getDashboard]);

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
