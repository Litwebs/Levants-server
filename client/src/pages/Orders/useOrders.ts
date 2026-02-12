import { useEffect, useMemo, useState, useCallback } from "react";
import { useToast } from "../../components/common/Toast";
import { useOrdersApi, type AdminOrder } from "../../context/Orders";

type FulfillmentStatus =
  | "pending"
  | "paid"
  | "failed"
  | "cancelled"
  | "refund_pending"
  | "refunded"
  | "refund_failed"
  | (string & {});

export type OrderItem = {
  name: string;
  variant?: string;
  quantity: number;
  unitPrice: number;
};

export type Order = {
  id: string;
  orderNumber: string;
  customer: { name: string; email: string; phone: string };
  deliveryAddress: { line1: string; line2?: string; city: string; postcode: string };
  deliverySlot: { date: string; timeWindow: string };
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  fulfillmentStatus: FulfillmentStatus;
  paymentStatus: FulfillmentStatus;
  customerNotes?: string;
  internalNotes?: string;
  history: { status: string; timestamp: string; user: string }[];
  createdAt: string;
  updatedAt: string;
};

const getDefaultAddress = (customer: any) => {
  const addresses = Array.isArray(customer?.addresses) ? customer.addresses : [];
  return (
    addresses.find((a: any) => a?.isDefault) ||
    addresses[0] || {
      line1: "-",
      line2: null,
      city: "-",
      postcode: "-",
      country: "-",
    }
  );
};

const mapAdminOrderToUi = (order: AdminOrder): Order => {
  const customer =
    order.customer && typeof order.customer === "object" ? order.customer : null;
  const addr = getDefaultAddress(customer);

  const customerName = customer
    ? `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() ||
      customer.email
    : "-";

  return {
    id: order._id,
    orderNumber: order.orderId,

    customer: {
      name: customerName,
      email: customer?.email ?? "-",
      phone: customer?.phone ?? "-",
    },

    deliveryAddress: {
      line1: addr.line1 ?? "-",
      line2: addr.line2 ?? undefined,
      city: addr.city ?? "-",
      postcode: addr.postcode ?? "-",
    },

    // Backend doesn't have delivery slot yet; keep UI stable.
    deliverySlot: {
      date: order.createdAt,
      timeWindow: "-",
    },

    items: (order.items ?? []).map((i) => ({
      name: i.name,
      variant: i.sku,
      quantity: i.quantity,
      unitPrice: i.price,
    })),

    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    discount: 0,
    total: order.total,

    fulfillmentStatus: order.status,
    paymentStatus: order.status,

    history: [],

    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};

export const useOrders = () => {
  const { showToast } = useToast();
  const {
    orders: adminOrders,
    meta,
    loading,
    error,
    listOrders,
    getOrderById,
    updateOrderStatus: updateOrderStatusApi,
    refundOrder: refundOrderApi,
  } = useOrdersApi();

  // Backend filters
  const [searchQuery, setSearchQuery] = useState(""); // free-text server-side search
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("newest");
  const [minTotal, setMinTotal] = useState("");
  const [maxTotal, setMaxTotal] = useState("");

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [refundedOnly, setRefundedOnly] = useState(false);
  const [expiredOnly, setExpiredOnly] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const mapSortToApi = (value: string): { sortBy?: string; sortOrder?: "asc" | "desc" } => {
    if (value === "newest") return { sortBy: "createdAt", sortOrder: "desc" };
    if (value === "oldest") return { sortBy: "createdAt", sortOrder: "asc" };
    if (value === "total-high") return { sortBy: "total", sortOrder: "desc" };
    if (value === "total-low") return { sortBy: "total", sortOrder: "asc" };
    if (value === "delivery") return { sortBy: "createdAt", sortOrder: "desc" };
    return { sortBy: "createdAt", sortOrder: "desc" };
  };

  // Convenience presets for createdAt date range
  useEffect(() => {
    if (dateFilter === "all") {
      setDateFrom("");
      setDateTo("");
      return;
    }

    if (dateFilter === "custom") return;

    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date(now);
    endOfToday.setHours(23, 59, 59, 999);

    const toIsoDate = (d: Date) => d.toISOString().slice(0, 10);

    if (dateFilter === "today") {
      setDateFrom(toIsoDate(startOfToday));
      setDateTo(toIsoDate(endOfToday));
      return;
    }

    if (dateFilter === "week") {
      const from = new Date(startOfToday.getTime() - 7 * 86400000);
      setDateFrom(toIsoDate(from));
      setDateTo(toIsoDate(endOfToday));
      return;
    }

    if (dateFilter === "month") {
      const from = new Date(startOfToday.getTime() - 30 * 86400000);
      setDateFrom(toIsoDate(from));
      setDateTo(toIsoDate(endOfToday));
      return;
    }
  }, [dateFilter]);

  const refresh = useCallback(
    async (opts?: { page?: number; pageSize?: number }) => {
      const targetPage = opts?.page ?? page;
      const targetPageSize = opts?.pageSize ?? pageSize;

      const sort = mapSortToApi(sortBy);
      const effectiveStatus = statusFilter !== "all" ? statusFilter : undefined;

      await listOrders({
        page: targetPage,
        pageSize: targetPageSize,

        status: effectiveStatus,
        search: searchQuery || undefined,
        minTotal: minTotal || undefined,
        maxTotal: maxTotal || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        refundedOnly: refundedOnly ? true : undefined,
        expiredOnly: expiredOnly ? true : undefined,

        sortBy: sort.sortBy,
        sortOrder: sort.sortOrder,
      });
    },
    [
      listOrders,
      page,
      pageSize,
      sortBy,
      statusFilter,
      minTotal,
      maxTotal,
      dateFrom,
      dateTo,
      refundedOnly,
      expiredOnly,
      searchQuery,
    ],
  );

  // Fetch orders (server-side pagination + filters)
  useEffect(() => {
    const handle = window.setTimeout(() => {
      refresh().catch(() => {
        // error state is tracked in context
      });
    }, 250);

    return () => window.clearTimeout(handle);
  }, [refresh]);

  // Reset to page 1 when any filter changes (excluding pagination)
  useEffect(() => {
    setPage(1);
  }, [
    searchQuery,
    statusFilter,
    dateFilter,
    minTotal,
    maxTotal,
    dateFrom,
    dateTo,
    refundedOnly,
    expiredOnly,
    sortBy,
  ]);

  const orders = useMemo(() => adminOrders.map(mapAdminOrderToUi), [adminOrders]);

  // Backend already applies filters/sort; UI should render the server result.
  const filteredOrders = orders;

  const statusCounts = useMemo<Record<string, number>>(
    () => ({
      all: orders.length,
      pending: orders.filter((o) => o.fulfillmentStatus === "pending").length,
      paid: orders.filter((o) => o.fulfillmentStatus === "paid").length,
      cancelled: orders.filter((o) => o.fulfillmentStatus === "cancelled").length,
      refunded: orders.filter((o) => o.fulfillmentStatus === "refunded").length,
      failed: orders.filter((o) => o.fulfillmentStatus === "failed").length,
      refund_pending: orders.filter((o) => o.fulfillmentStatus === "refund_pending").length,
      refund_failed: orders.filter((o) => o.fulfillmentStatus === "refund_failed").length,
    }),
    [orders],
  );

  const toggleOrderSelection = (id: string) => {
    setSelectedOrders((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    setSelectedOrders((prev) =>
      prev.length === filteredOrders.length ? [] : filteredOrders.map((o) => o.id),
    );
  };

  const updateOrderStatus = async (id: string, status: FulfillmentStatus) => {
    // Backend currently supports: pending | paid | cancelled | refunded
    if (
      status !== "pending" &&
      status !== "paid" &&
      status !== "cancelled" &&
      status !== "refunded"
    ) {
      showToast({ title: "Unsupported status", type: "error" });
      return;
    }

    try {
      await updateOrderStatusApi(id, status);
      showToast({ title: "Order status updated", type: "success" });
      setIsStatusModalOpen(false);
    } catch {
      showToast({ title: "Failed to update status", type: "error" });
    }
  };

  const refundOrder = async (id: string) => {
    try {
      await refundOrderApi(id);
      showToast({ title: "Order refunded", type: "success" });
      await refresh();
    } catch {
      showToast({ title: "Refund failed", type: "error" });
      throw new Error("Refund failed");
    }
  };

  const bulkUpdateStatus = async (status: FulfillmentStatus) => {
    if (!selectedOrders.length) return;

    if (
      status !== "pending" &&
      status !== "paid" &&
      status !== "cancelled" &&
      status !== "refunded"
    ) {
      showToast({ title: "Unsupported status", type: "error" });
      return;
    }

    try {
      await Promise.all(selectedOrders.map((id) => updateOrderStatusApi(id, status)));
      showToast({
        title: `${selectedOrders.length} orders updated`,
        type: "success",
      });
      setSelectedOrders([]);
    } catch {
      showToast({ title: "Bulk update failed", type: "error" });
    }
  };

  const exportToCSV = () => {
    const rows = filteredOrders.map(
      (o) => `${o.orderNumber},${o.customer.name},${o.customer.email},£${o.total}`,
    );
    const csv = ["Order,Customer,Email,Total", ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), {
      href: url,
      download: "orders.csv",
    }).click();
    showToast({ title: "Orders exported", type: "success" });
  };

  const openOrderDetails = useCallback(
    async (orderId: string) => {
      setIsDetailModalOpen(true);
      try {
        const adminOrder = await getOrderById(orderId);
        setSelectedOrder(mapAdminOrderToUi(adminOrder));
      } catch {
        showToast({ title: "Failed to load order", type: "error" });
        setIsDetailModalOpen(false);
      }
    },
    [getOrderById, showToast],
  );

  return {
    orders,
    loading,
    error,
    meta,
    refresh,

    page,
    setPage,
    pageSize,
    setPageSize,

    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    dateFilter,
    setDateFilter,
    sortBy,
    setSortBy,

    minTotal,
    setMinTotal,
    maxTotal,
    setMaxTotal,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    refundedOnly,
    setRefundedOnly,
    expiredOnly,
    setExpiredOnly,

    selectedOrders,
    setSelectedOrders,
    selectedOrder,
    setSelectedOrder,

    isDetailModalOpen,
    setIsDetailModalOpen,
    isStatusModalOpen,
    setIsStatusModalOpen,
    showFilters,
    setShowFilters,

    filteredOrders,
    statusCounts,

    toggleOrderSelection,
    toggleSelectAll,
    updateOrderStatus,
    refundOrder,
    bulkUpdateStatus,
    exportToCSV,
    openOrderDetails,
  };
};
