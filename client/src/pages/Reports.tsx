import { useEffect, useMemo } from "react";
import {
  DollarSign,
  ShoppingCart,
  Truck,
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
import { SimpleBarChart, DonutChart } from "../components/charts";

import {
  useAnalyticsApi,
  type AnalyticsDateRange,
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

const Reports = () => {
  const {
    dashboard,
    loading,
    error,
    range,
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
      ...(isCustom ? { from, to } : { range }),
    });
  }, [range, from, to, interval, getDashboard]);

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
    { value: "week", label: "Weekly" },
    { value: "month", label: "Monthly" },
    { value: "year", label: "Yearly" },
  ];

  const summary = dashboard?.summary;
  const revenuePoints = dashboard?.revenue?.points ?? [];

  const revenueChartData = useMemo(
    () => revenuePoints.map((p) => ({ label: p.label, value: p.revenue })),
    [revenuePoints],
  );

  const totalRevenueInPeriod = useMemo(
    () => revenuePoints.reduce((sum, p) => sum + (p.revenue || 0), 0),
    [revenuePoints],
  );

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

  const topProducts = dashboard?.topProducts?.products ?? [];
  const maxTopRevenue = topProducts[0]?.totalRevenue || 1;

  const topProductsChart = useMemo(
    () =>
      topProducts.map((p) => ({
        label: p.productName,
        value: p.totalQuantity,
        percentage: (p.totalRevenue / maxTopRevenue) * 100,
        revenue: p.totalRevenue,
        variants: p.variants,
      })),
    [topProducts, maxTopRevenue],
  );

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
              setFilters({ range: value as AnalyticsDateRange })
            }
            options={dateRangeOptions}
          />

          <Select
            value={interval}
            onChange={(value) =>
              setFilters({
                range,
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
              <span className={styles.kpiLabel}>Revenue</span>
              <span className={styles.kpiValue}>
                {formatCurrency(summary?.revenue ?? 0)}
              </span>
            </div>
          </div>
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiContent}>
            <div className={`${styles.kpiIcon} ${styles.primary}`}>
              <ShoppingCart size={24} />
            </div>
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>Total Orders</span>
              <span className={styles.kpiValue}>
                {summary?.totalOrders ?? 0}
              </span>
            </div>
          </div>
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiContent}>
            <div className={`${styles.kpiIcon} ${styles.warning}`}>
              <BarChart3 size={24} />
            </div>
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>New Orders</span>
              <span className={styles.kpiValue}>
                {summary?.pendingOrders ?? 0}
              </span>
            </div>
          </div>
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiContent}>
            <div className={`${styles.kpiIcon} ${styles.info}`}>
              <Truck size={24} />
            </div>
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>Out for Delivery</span>
              <span className={styles.kpiValue}>
                {summary?.paidOrders ?? 0}
              </span>
            </div>
          </div>
        </Card>
      </div>

      <div className={styles.kpiGrid}>
        <Card className={styles.kpiCard}>
          <div className={styles.kpiContent}>
            <div className={`${styles.kpiIcon} ${styles.success}`}>
              <Truck size={24} />
            </div>
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>Delivered</span>
              <span className={styles.kpiValue}>
                {summary?.refundedOrders ?? 0}
              </span>
            </div>
          </div>
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiContent}>
            <div className={`${styles.kpiIcon} ${styles.warning}`}>
              <Package size={24} />
            </div>
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>Low Stock Items</span>
              <span className={styles.kpiValue}>
                {summary?.lowStockItems ?? 0}
              </span>
            </div>
          </div>
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiContent}>
            <div className={`${styles.kpiIcon} ${styles.error}`}>
              <ShoppingCart size={24} />
            </div>
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>Cancelled</span>
              <span className={styles.kpiValue}>
                {summary?.cancelledOrders ?? 0}
              </span>
            </div>
          </div>
        </Card>

        <Card className={styles.kpiCard}>
          <div className={styles.kpiContent}>
            <div className={`${styles.kpiIcon} ${styles.primary}`}>
              <DollarSign size={24} />
            </div>
            <div className={styles.kpiInfo}>
              <span className={styles.kpiLabel}>Revenue (chart total)</span>
              <span className={styles.kpiValue}>
                {formatCurrency(totalRevenueInPeriod)}
              </span>
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
              type="bar"
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

      <div className={styles.chartsGrid}>
        <Card className={styles.chartCard}>
          <CardHeader>
            <CardTitle>Top Products (Top 5)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={styles.productRanking}>
              {topProductsChart.length === 0 && !loading ? (
                <div className={styles.emptyState}>No data</div>
              ) : (
                topProductsChart.map((p, index) => (
                  <div key={p.label} className={styles.rankItem}>
                    <span className={styles.rankNumber}>#{index + 1}</span>
                    <div className={styles.rankInfo}>
                      <span className={styles.rankName}>{p.label}</span>
                      <span className={styles.rankMeta}>
                        {p.value} units · {formatCurrency(p.revenue)}
                      </span>
                    </div>
                    <div className={styles.rankBar}>
                      <div
                        className={styles.rankFill}
                        style={{ width: `${p.percentage}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>

            {topProducts.length > 0 ? (
              <div className={styles.variantBlock}>
                {topProducts.map((p) => (
                  <div key={p.productId} className={styles.variantCard}>
                    <div className={styles.variantHeader}>
                      <span className={styles.variantTitle}>
                        {p.productName}
                      </span>
                      <span className={styles.variantMeta}>
                        {formatCurrency(p.totalRevenue)} · {p.totalQuantity}{" "}
                        units
                      </span>
                    </div>
                    <div className={styles.variantList}>
                      {(p.variants || []).map((v) => (
                        <div key={v.variantId} className={styles.variantItem}>
                          <div className={styles.variantLeft}>
                            <span className={styles.variantName}>{v.name}</span>
                            <span className={styles.variantSku}>{v.sku}</span>
                          </div>
                          <div className={styles.variantRight}>
                            <span className={styles.variantRevenue}>
                              {formatCurrency(v.revenue)}
                            </span>
                            <span className={styles.variantQty}>
                              {v.quantity}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
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
