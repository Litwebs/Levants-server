import { useMemo } from "react";
import {
  AlertTriangle,
  DollarSign,
  Calendar,
  Package,
  ShoppingCart,
  Truck,
  RotateCcw,
} from "lucide-react";

import { formatCompactNumber, formatCurrencyGBP } from "../../lib/numberFormat";

type StatCard = {
  label: string;
  value: React.ReactNode;
  icon: React.ElementType;
  color: "primary" | "success" | "warning" | "info" | "error";
  change?: string;
};

type UseDashboardViewModelArgs = {
  dashboard: any;
  revenueOverview: any;
};

export function useDashboardViewModel({
  dashboard,
  revenueOverview,
}: UseDashboardViewModelArgs) {
  const summary = dashboard?.summary;

  const statCards: StatCard[] = useMemo(
    () => [
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
        label: "Refunds",
        value: formatCompactNumber(summary?.totalRefunds ?? 0),
        icon: RotateCcw,
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
    ],
    [summary],
  );

  const revenueData = useMemo(() => {
    const points = revenueOverview?.points ?? [];
    return points.map((p: any) => {
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

    return products.map((p: any) => ({
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

  const totalRevenue = useMemo(
    () => revenueData.reduce((sum, d) => sum + (d.value || 0), 0),
    [revenueData],
  );

  const recentOrders = dashboard?.recentOrders?.orders ?? [];
  const lowStockItems = dashboard?.lowStock?.items ?? [];
  const outOfStockItems = dashboard?.outOfStock?.items ?? [];

  // Keep this export in case you want to use the icon elsewhere later
  const summaryIcons = {
    totalOrders: Calendar,
    revenue: DollarSign,
    lowStock: Package,
  };

  return {
    summary,
    statCards,
    revenueData,
    topProducts,
    orderStatusData,
    totalRevenue,
    recentOrders,
    lowStockItems,
    outOfStockItems,
    summaryIcons,
  };
}
