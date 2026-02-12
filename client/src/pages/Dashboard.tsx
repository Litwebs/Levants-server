import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  DollarSign,
  Truck,
  AlertTriangle,
  Plus,
  Eye,
  ArrowUpRight,
  Package,
  Calendar,
  RefreshCw,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Badge,
  Select,
} from "../components/common";
import {
  SimpleBarChart,
  HorizontalBarChart,
  DonutChart,
} from "../components/charts";
import {
  useAnalyticsApi,
  type AnalyticsDateRange,
  type RevenueInterval,
} from "../context/Analytics";
import { formatCompactNumber, formatCurrencyGBP } from "../lib/numberFormat";
import styles from "./Dashboard.module.css";

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const {
    dashboard,
    loading,
    error,
    getDashboard,
    getRevenueOverview,
    revenueOverview,
    revenueOverviewLoading,
    revenueOverviewError,
    range,
    from,
    to,
    interval,
    setFilters,
  } = useAnalyticsApi();

  useEffect(() => {
    const isCustom = range === "custom";
    if (isCustom && (!from || !to)) return;

    void getDashboard({
      interval,
      ...(isCustom ? { from, to } : { range }),
    });
  }, [range, from, to, interval, getDashboard]);

  useEffect(() => {
    // Fixed daily window; not affected by selected filters
    void getRevenueOverview();
  }, [getRevenueOverview]);

  const summary = dashboard?.summary;

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
  type StatCard = {
    label: string;
    value: React.ReactNode;
    icon: React.ElementType;
    color: "primary" | "success" | "warning" | "info" | "error";
    change?: string;
  };

  const statCards: StatCard[] = [
    {
      label: "Total Orders",
      value: formatCompactNumber(summary?.totalOrders ?? 0),
      icon: ShoppingCart,
      color: "primary",
    },
    {
      label: "Revenue",
      value: formatCurrencyGBP(summary?.revenue ?? 0),
      icon: DollarSign,
      color: "success",
    },
    {
      label: "Pending",
      value: formatCompactNumber(summary?.pendingOrders ?? 0),
      icon: Calendar,
      color: "warning",
    },
    {
      label: "Paid",
      value: formatCompactNumber(summary?.paidOrders ?? 0),
      icon: Truck,
      color: "info",
    },
    {
      label: "Low Stock",
      value: formatCompactNumber(summary?.lowStockItems ?? 0),
      icon: AlertTriangle,
      color: "warning",
    },
    {
      label: "Out of Stock",
      value: formatCompactNumber(summary?.outOfStockItems ?? 0),
      icon: AlertTriangle,
      color: "error",
    },
  ];

  const revenueData = useMemo(() => {
    const points = revenueOverview?.points ?? [];
    return points.map((p) => {
      const date = new Date(`${p.date}T00:00:00`);
      const label = Number.isNaN(date.getTime())
        ? p.date
        : date.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
          });

      return {
        label,
        value: p.revenue,
        highlight: p.isToday,
      };
    });
  }, [revenueOverview?.points]);

  const topProducts = useMemo(() => {
    const products = dashboard?.topProducts?.products ?? [];
    const max = products[0]?.totalRevenue || 1;
    return products.map((p) => ({
      label: p.productName,
      value: p.totalQuantity,
      percentage: (p.totalRevenue / max) * 100,
    }));
  }, [dashboard?.topProducts?.products]);

  const orderStatusData = useMemo(() => {
    const counts = summary?.orderStatus;
    return [
      { label: "Pending", value: counts?.Pending ?? 0, color: "#f59e0b" },
      { label: "Paid", value: counts?.Paid ?? 0, color: "#22c55e" },
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

  const recentOrders = dashboard?.recentOrders?.orders ?? [];
  const lowStockItems = dashboard?.lowStock?.items ?? [];
  const outOfStockItems = dashboard?.outOfStock?.items ?? [];

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      "success" | "warning" | "error" | "info" | "default"
    > = {
      pending: "warning",
      paid: "success",
      failed: "error",
      cancelled: "error",
      refund_pending: "warning",
      refunded: "info",
      refund_failed: "error",
    };
    return (
      <Badge variant={variants[status] || "default"}>
        {status.replace(/_/g, " ")}
      </Badge>
    );
  };

  const totalRevenue = revenueData.reduce((sum, d) => sum + (d.value || 0), 0);
  const totalOrders = summary?.totalOrders ?? 0;

  return (
    <div className={styles.dashboard}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>
            Welcome back! Here's what's happening today.
          </p>
        </div>
        <div className={styles.actions}>
          <div className={styles.filtersBar}>
            <Select
              value={range}
              onChange={(value) =>
                setFilters({
                  range: value as AnalyticsDateRange,
                  interval,
                })
              }
              options={dateRangeOptions}
            />
          </div>

          <Button
            variant="outline"
            leftIcon={<Eye size={16} />}
            onClick={() => navigate("/orders")}
          >
            View New Orders
          </Button>
          <Button
            variant="primary"
            leftIcon={<Plus size={16} />}
            onClick={() => navigate("/products")}
          >
            Create Product
          </Button>
        </div>
      </div>

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

      {error ? <div className={styles.emptyState}>{error}</div> : null}
      {revenueOverviewError ? (
        <div className={styles.emptyState}>{revenueOverviewError}</div>
      ) : null}

      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i} className={styles.statCard}>
              <div className={styles.statContent}>
                <div className={`${styles.statIcon} ${styles[stat.color]}`}>
                  <Icon size={20} />
                </div>
                <div className={styles.statInfo}>
                  <p className={styles.statLabel}>{stat.label}</p>
                  <div className={styles.statRow}>
                    <p className={styles.statValue}>{stat.value}</p>
                    {stat.change && (
                      <span className={styles.statChange}>{stat.change}</span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <Card className={styles.summaryCard}>
          <div className={styles.summaryContent}>
            <div className={`${styles.summaryIcon} ${styles.info}`}>
              <Calendar size={24} />
            </div>
            <div>
              <p className={styles.summaryValue}>
                {formatCompactNumber(totalOrders)}
              </p>
              <p className={styles.summaryLabel}>
                Total Orders (selected period)
              </p>
            </div>
          </div>
        </Card>
        <Card className={styles.summaryCard}>
          <div className={styles.summaryContent}>
            <div className={`${styles.summaryIcon} ${styles.success}`}>
              <DollarSign size={24} />
            </div>
            <div>
              <p className={styles.summaryValue}>
                {formatCurrencyGBP(summary?.revenue ?? 0)}
              </p>
              <p className={styles.summaryLabel}>Revenue (selected period)</p>
            </div>
          </div>
        </Card>
        <Card className={styles.summaryCard}>
          <div className={styles.summaryContent}>
            <div className={`${styles.summaryIcon} ${styles.warning}`}>
              <Package size={24} />
            </div>
            <div>
              <p className={styles.summaryValue}>
                {formatCompactNumber(summary?.lowStockItems ?? 0)}
              </p>
              <p className={styles.summaryLabel}>Low Stock Items</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Row */}
      <div className={styles.chartsGrid}>
        <Card className={styles.chartCard}>
          <CardHeader>
            <CardTitle>Revenue Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart
              data={revenueData}
              type="bar"
              height={220}
              color="success"
              valueFormatter={(v) => formatCurrencyGBP(v, { compact: true })}
            />
            <div className={styles.chartFooter}>
              <span className={styles.chartTotal}>
                Total: {formatCurrencyGBP(totalRevenue)}
              </span>
            </div>
            {revenueOverviewLoading ? (
              <div className={styles.emptyState}>Loading revenue…</div>
            ) : null}
          </CardContent>
        </Card>

        <Card className={styles.chartCard}>
          <CardHeader>
            <CardTitle>Top Products</CardTitle>
          </CardHeader>
          <CardContent>
            {topProducts.length === 0 ? (
              <div className={styles.emptyState}>
                No top products for this period.
              </div>
            ) : (
              <HorizontalBarChart data={topProducts} color="primary" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Orders and Stock Row */}
      <div className={styles.grid}>
        <Card className={styles.ordersCard}>
          <CardHeader
            action={
              <Button
                variant="ghost"
                size="sm"
                rightIcon={<ArrowUpRight size={14} />}
                onClick={() => navigate("/orders")}
              >
                View All
              </Button>
            }
          >
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={styles.ordersList}>
              {recentOrders.map((order) => (
                <div
                  key={order._id}
                  className={styles.orderItem}
                  onClick={() => navigate("/orders")}
                >
                  <div className={styles.orderInfo}>
                    <span className={styles.orderNumber}>{order.orderId}</span>
                    <span className={styles.orderCustomer}>
                      {order?.customer?.firstName || order?.customer?.lastName
                        ? `${order.customer.firstName || ""} ${order.customer.lastName || ""}`.trim()
                        : order?.customer?.email || "Guest"}
                    </span>
                    <span className={styles.orderDate}>
                      {new Date(order.createdAt).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                  <div className={styles.orderMeta}>
                    <div className={styles.orderBadges}>
                      {getStatusBadge(order.status)}
                    </div>
                    <span className={styles.orderTotal}>
                      {formatCurrencyGBP(Number(order.total || 0))}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className={styles.sideColumn}>
          <Card className={styles.statusCard}>
            <CardHeader>
              <CardTitle>Order Status</CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart data={orderStatusData} size={120} showLegendValues />
            </CardContent>
          </Card>

          <Card className={styles.stockCard}>
            <CardHeader
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  rightIcon={<ArrowUpRight size={14} />}
                  onClick={() => navigate("/products")}
                >
                  View All
                </Button>
              }
            >
              <CardTitle>Low Stock Alert</CardTitle>
            </CardHeader>
            <CardContent>
              {lowStockItems.length === 0 ? (
                <p className={styles.emptyState}>
                  All products are well stocked!
                </p>
              ) : (
                <div className={styles.stockList}>
                  {lowStockItems.slice(0, 6).map((item) => (
                    <div
                      key={item._id}
                      className={`${styles.stockItem} ${styles.stockItemLow}`}
                    >
                      <Package
                        size={18}
                        className={`${styles.stockIcon} ${styles.stockIconLow}`}
                      />
                      <div className={styles.stockInfo}>
                        <span className={styles.stockName}>
                          {item.product?.name ? `${item.product.name} · ` : ""}
                          {item.name}
                        </span>
                        <span className={styles.stockQty}>
                          {formatCompactNumber(item.available)} available
                        </span>
                      </div>
                      <Badge variant="warning" size="sm">
                        Low
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className={styles.stockCard}>
            <CardHeader
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  rightIcon={<ArrowUpRight size={14} />}
                  onClick={() => navigate("/products")}
                >
                  View All
                </Button>
              }
            >
              <CardTitle>Out of Stock</CardTitle>
            </CardHeader>
            <CardContent>
              {outOfStockItems.length === 0 ? (
                <p className={styles.emptyState}>No items are out of stock.</p>
              ) : (
                <div className={styles.stockList}>
                  {outOfStockItems.slice(0, 6).map((item) => (
                    <div key={item._id} className={styles.stockItem}>
                      <Package size={18} className={styles.stockIcon} />
                      <div className={styles.stockInfo}>
                        <span className={styles.stockName}>
                          {item.product?.name ? `${item.product.name} · ` : ""}
                          {item.name}
                        </span>
                        <span className={styles.stockQty}>
                          {formatCompactNumber(item.available)} available
                        </span>
                      </div>
                      <Badge variant="error" size="sm">
                        OOS
                      </Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
