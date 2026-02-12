import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAnalyticsApi } from "../../context/Analytics";

import styles from "./Dashboard.module.css";
import { dateRangeOptions } from "./dashboard.constants";
import { useDashboardViewModel } from "./dashboard.viewmodel";

import DashboardHeader from "./components/DashboardHeader";
import DashboardStats from "./components/DashboardStats";
import DashboardCharts from "./components/DashboardCharts";
import DashboardOrdersStock from "./components/DashboardOrdersStock";

const Dashboard: React.FC = () => {
  const navigate = useNavigate();

  const {
    dashboard,
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

  const vm = useDashboardViewModel({
    dashboard,
    revenueOverview,
  });

  return (
    <div className={styles.dashboard}>
      <DashboardHeader
        range={range}
        interval={interval}
        setFilters={setFilters}
        dateRangeOptions={dateRangeOptions}
        onViewOrders={() => navigate("/orders")}
        onCreateProduct={() => navigate("/products")}
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

      {error ? <div className={styles.emptyState}>{error}</div> : null}
      {revenueOverviewError ? (
        <div className={styles.emptyState}>{revenueOverviewError}</div>
      ) : null}

      <DashboardStats summary={vm.summary} statCards={vm.statCards} />

      <DashboardCharts
        revenueData={vm.revenueData}
        totalRevenue={vm.totalRevenue}
        topProducts={vm.topProducts}
        revenueOverviewLoading={revenueOverviewLoading}
      />

      <DashboardOrdersStock
        recentOrders={vm.recentOrders}
        orderStatusData={vm.orderStatusData}
        lowStockItems={vm.lowStockItems}
        outOfStockItems={vm.outOfStockItems}
        onViewAllOrders={() => navigate("/orders")}
        onViewAllProducts={() => navigate("/products")}
      />
    </div>
  );
};

export default Dashboard;
