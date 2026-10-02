import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useToast } from "../../components/common/Toast";
import { useSearchParams } from "react-router-dom";
import {
  useOrdersApi,
  type AdminOrder,
  type OrderCustomer,
  type OrdersStockRequirements,
} from "../../context/Orders";

type FulfillmentStatus =
  | "pending"
  | "unpaid"
  | "paid"
  | "failed"
  | "cancelled"
  | "refund_pending"
  | "refunded"
  | "refund_failed"
  | (string & {});

const MANUAL_IMPORT_DELIVERY_FEE = 1;

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "object" && error !== null) {
    const response = "response" in error ? error.response : null;
    if (typeof response === "object" && response !== null && "data" in response) {
      const data = response.data;
      if (typeof data === "object" && data !== null && "message" in data && typeof data.message === "string") {
        return data.message;
      }
    }
  }
  return error instanceof Error && error.message ? error.message : fallback;
};

const parseDateInput = (value: string) => {
  if (!value) return null;
  if (value.includes("T")) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parts = value.split("-").map(Number);
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  if (!year || !month || !day) return null;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toStartOfDayIso = (value: string) => {
  const date = parseDateInput(value);
  if (!date) return undefined;
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};

const toEndOfDayIso = (value: string) => {
  const date = parseDateInput(value);
  if (!date) return undefined;
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
};

export type OrderItem = {
  name: string;
  variant?: string;
  variantId?: string;
  quantity: number;
  unitPrice: number;
};

export type Order = {
  id: string;
  orderNumber: string;
  orderType?: "one_time" | "subscription_generated" | (string & {});
  isSubscriptionGenerated?: boolean;
  customer: { name: string; email: string; phone: string };
  deliveryAddress: { line1: string; line2?: string; city: string; postcode: string };
  deliverySlot: { date: string; timeWindow: string };
  items: OrderItem[];
  itemCount: number;
  subtotal: number;
  deliveryFee: number;
  deliveryStatus:string
  discount: number;
  total: number;
  amountPaid?: number;
  amountRefunded?: number;
  importedBaseTotal?: number;
  includeDeliveryFeeInTotal?: boolean;
  usesImportedBasePricing?: boolean;
  // fulfillmentStatus: FulfillmentStatus;
  paymentStatus: FulfillmentStatus;
  isManualImport?: boolean;
  isStripeBacked?: boolean;
  customerInstructions?: string;
  customerNotes?: string;
  internalNotes?: string;
  driverNote?: string | null;
  history: {
    id?: string;
    from?: string | null;
    status: string;
    timestamp: string;
    user: string;
    role?: string | null;
    source?: string;
    effects: string[];
  }[];
  deliveryProofUrl?: string;
  deliveredAt?: string | null;
  deliveryNote?: string;
  emailNotifications: {
    orderConfirmationSentAt: string | null;
    dispatchedEmailSentAt: string | null;
    inTransitEmailSentAt: string | null;
    deliveredEmailSentAt: string | null;
  };
  createdAt: string;
  updatedAt: string;
  
};

const getDefaultAddress = (customer: OrderCustomer | null) => {
  const addresses = Array.isArray(customer?.addresses) ? customer.addresses : [];
  return (
    addresses.find((address) => address.isDefault) ||
    addresses[0] || {
      line1: "-",
      line2: null,
      city: "-",
      postcode: "-",
      country: "-",
    }
  );
};

const isNonEmptyString = (v: unknown) => typeof v === "string" && v.trim().length > 0;

const getMetadataDate = (
  metadata: Record<string, unknown> | null,
  key: string,
) => {
  const value = metadata?.[key];
  if (typeof value === "string" && value.trim()) return value;
  if (value instanceof Date) return value.toISOString();
  return null;
};

const getOrderDeliveryAddress = (order: AdminOrder, customer: OrderCustomer | null) => {
  const fromOrder = order.deliveryAddress;
  if (fromOrder && typeof fromOrder === "object") {
    const { line1, city, postcode } = fromOrder;

    if (isNonEmptyString(line1) && isNonEmptyString(city) && isNonEmptyString(postcode)) {
      return {
        line1: String(line1).trim(),
        line2: isNonEmptyString(fromOrder.line2)
          ? String(fromOrder.line2).trim()
          : undefined,
        city: String(city).trim(),
        postcode: String(postcode).trim(),
      };
    }
  }

  const addr = getDefaultAddress(customer);
  return {
    line1: addr.line1 ?? "-",
    line2: addr.line2 ?? undefined,
    city: addr.city ?? "-",
    postcode: addr.postcode ?? "-",
  };
};

export const mapAdminOrderToUi = (order: AdminOrder): Order => {
  const customer =
    order.customer && typeof order.customer === "object" ? order.customer : null;

  const customerName = customer
    ? `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() ||
      customer.email
    : "-";

  const metadata =
    order.metadata && typeof order.metadata === "object"
      ? order.metadata
      : null;

  const deliveryProofUrl =
    typeof metadata?.deliveryProofUrl === "string"
      ? String(metadata.deliveryProofUrl).trim() || undefined
      : undefined;

  const deliveredAtRaw =
    metadata?.deliveredAt ?? metadata?.deliveredEmailSentAt;
  const deliveredAt =
    typeof deliveredAtRaw === "string"
      ? deliveredAtRaw
      : deliveredAtRaw instanceof Date
        ? deliveredAtRaw.toISOString()
        : null;

  const deliveryNote =
    typeof metadata?.deliveryNote === "string"
      ? String(metadata.deliveryNote).trim() || undefined
      : undefined;

  const customerInstructions =
    typeof order.customerInstructions === "string"
      ? order.customerInstructions.trim() || undefined
      : undefined;

  const isManualImport = Boolean(metadata?.manualImport);
  const isStripeBacked = Boolean(
    order.stripeCheckoutSessionId || order.stripePaymentIntentId,
  );
  const effectiveDeliveryFee = isManualImport
    ? MANUAL_IMPORT_DELIVERY_FEE
    : order.deliveryFee;
  const discount =
    typeof order.discountAmount === "number"
      ? order.discountAmount
      : typeof order.totalBeforeDiscount === "number"
        ? Math.max(0, order.totalBeforeDiscount - order.total)
        : 0;
  const inferredIncludeDeliveryFeeInTotal =
    Math.abs(order.total - Math.max(0, order.subtotal + effectiveDeliveryFee - discount)) <
    0.000001;
  const includeDeliveryFeeInTotal =
    typeof order.includeDeliveryFeeInTotal === "boolean"
      ? order.includeDeliveryFeeInTotal
      : typeof metadata?.includeDeliveryFeeInTotal === "boolean"
        ? Boolean(metadata.includeDeliveryFeeInTotal)
        : inferredIncludeDeliveryFeeInTotal;
  const metadataImportedBaseTotal =
    typeof metadata?.importedBaseTotal === "number"
      ? metadata.importedBaseTotal
      : null;
  const importedBaseTotal =
    metadataImportedBaseTotal !== null
      ? metadataImportedBaseTotal
      : Math.max(
          0,
          order.total + discount - (includeDeliveryFeeInTotal ? effectiveDeliveryFee : 0),
        );
  const usesImportedBasePricing =
    isManualImport &&
    (metadataImportedBaseTotal !== null || !inferredIncludeDeliveryFeeInTotal);

  return {
    id: order._id,
    orderNumber: order.orderId,
    orderType: order.orderType,
    isSubscriptionGenerated:
      order.orderType === "subscription_generated" || Boolean(order.subscription),

    customer: {
      name: customerName,
      email: customer?.email ?? "-",
      phone: customer?.phone ?? "-",
    },

    deliveryAddress: getOrderDeliveryAddress(order, customer),

    // Backend doesn't have delivery slot yet; keep UI stable.
    // If admin assigns a deliveryDate, use it as the slot date.
    deliverySlot: {
      date: order.deliveryDate || order.createdAt,
      timeWindow: "-",
    },

    items: (order.items ?? []).map((i) => ({
      name: i.name,
      variant: i.sku,
      variantId: i.variant,
      quantity: i.quantity,
      unitPrice: i.price,
    })),
    itemCount: (order.items ?? []).reduce((total, item) => total + item.quantity, 0),

    subtotal: order.subtotal,
    deliveryFee: effectiveDeliveryFee,
    discount,
    total: order.total,
    amountPaid: typeof order.amountPaid === "number" ? order.amountPaid : undefined,
    amountRefunded: Array.isArray(order.refunds)
      ? order.refunds
          .filter((refund) => refund.status === "succeeded" && typeof refund.amount === "number")
          .reduce((sum, refund) => sum + (refund.amount || 0), 0) || undefined
      : undefined,
    importedBaseTotal,
    includeDeliveryFeeInTotal,
    usesImportedBasePricing,

    deliveryStatus: order.deliveryStatus,
    paymentStatus: order.status,

    isManualImport,
    isStripeBacked,

    customerInstructions,
    driverNote: typeof order.driverNote === "string" ? order.driverNote || null : null,

    history: Array.isArray(order.statusAudit)
      ? order.statusAudit.map((entry) => ({
          id: entry._id,
          from: entry.from || null,
          status: entry.to,
          timestamp: entry.changedAt,
          user: entry.actorName || "System",
          role: entry.actorRole || null,
          source: entry.source,
          effects: Array.isArray(entry.effects) ? entry.effects : [],
        }))
      : [],

  deliveryProofUrl,
  deliveredAt,
  deliveryNote,
  emailNotifications: {
    orderConfirmationSentAt: getMetadataDate(metadata, "orderConfirmationSentAt"),
    dispatchedEmailSentAt: getMetadataDate(metadata, "dispatchedEmailSentAt"),
    inTransitEmailSentAt: getMetadataDate(metadata, "inTransitEmailSentAt"),
    deliveredEmailSentAt: getMetadataDate(metadata, "deliveredEmailSentAt"),
  },

    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};

export const useOrders = () => {
  const { showToast } = useToast();
  const [urlParams, setUrlParams] = useSearchParams();
  const {
    orders: adminOrders,
    meta,
    loading: apiLoading,
    error,
    listOrders,
    bulkUpdateDeliveryStatus: bulkUpdateDeliveryStatusApi,
    bulkAssignDeliveryDate: bulkAssignDeliveryDateApi,
    getOrdersStockRequirements: getOrdersStockRequirementsApi,
  } = useOrdersApi();

  // Backend filters
  const [searchQuery, setSearchQuery] = useState(() => urlParams.get("q") || "");
  const [deliveryStatusFilter, setDeliveryStatusFilter] = useState(() =>
    urlParams.get("delivery") || "all",
  );
  const [paymentStatusFilter, setPaymentStatusFilter] = useState(() =>
    urlParams.get("payment") || "all",
  );
  const [orderSourceFilter, setOrderSourceFilter] = useState(() =>
    urlParams.get("source") || "all",
  );
  const [dateFilter, setDateFilter] = useState(() =>
    urlParams.get("range") || (urlParams.get("from") || urlParams.get("to") ? "custom" : "all"),
  );
  const [sortBy, setSortBy] = useState(() =>
    urlParams.get("sort") || "newest",
  );
  const [minTotal, setMinTotal] = useState(() => urlParams.get("min") || "");
  const [maxTotal, setMaxTotal] = useState(() => urlParams.get("max") || "");

  const [dateFrom, setDateFrom] = useState(() => urlParams.get("from") || "");
  const [dateTo, setDateTo] = useState(() => urlParams.get("to") || "");

  const [refundedOnly, setRefundedOnly] = useState(
    () => urlParams.get("refunded") === "true",
  );
  const [expiredOnly, setExpiredOnly] = useState(
    () => urlParams.get("expired") === "true",
  );
  const [pendingFilters, setPendingFilters] = useState(false);
  const filterRequestIdRef = useRef(0);
  const lastFilterKeyRef = useRef("");

  const [page, setPage] = useState(() =>
    Math.max(1, Number(urlParams.get("page")) || 1),
  );
  const [pageSize, setPageSize] = useState(() => {
    const value = Number(urlParams.get("pageSize"));
    return [50, 100, 200].includes(value) ? value : 50;
  });

  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(
    () => urlParams.get("filters") === "open",
  );
  const lastWrittenSearchRef = useRef(urlParams.toString());
  const syncingFromUrlRef = useRef(false);

  useEffect(() => {
    const search = urlParams.toString();
    if (search === lastWrittenSearchRef.current) return;
    syncingFromUrlRef.current = true;
    setSearchQuery(urlParams.get("q") || "");
    setDeliveryStatusFilter(urlParams.get("delivery") || "all");
    setPaymentStatusFilter(urlParams.get("payment") || "all");
    setOrderSourceFilter(urlParams.get("source") || "all");
    setDateFilter(
      urlParams.get("range") || (urlParams.get("from") || urlParams.get("to") ? "custom" : "all"),
    );
    setDateFrom(urlParams.get("from") || "");
    setDateTo(urlParams.get("to") || "");
    setMinTotal(urlParams.get("min") || "");
    setMaxTotal(urlParams.get("max") || "");
    setRefundedOnly(urlParams.get("refunded") === "true");
    setExpiredOnly(urlParams.get("expired") === "true");
    setSortBy(urlParams.get("sort") || "newest");
    setPage(Math.max(1, Number(urlParams.get("page")) || 1));
    const nextPageSize = Number(urlParams.get("pageSize"));
    setPageSize([50, 100, 200].includes(nextPageSize) ? nextPageSize : 50);
    setShowFilters(urlParams.get("filters") === "open");
  }, [urlParams]);

  useEffect(() => {
    if (syncingFromUrlRef.current) {
      syncingFromUrlRef.current = false;
      lastWrittenSearchRef.current = urlParams.toString();
      return;
    }
    const next = new URLSearchParams();
    if (searchQuery) next.set("q", searchQuery);
    if (deliveryStatusFilter !== "all") next.set("delivery", deliveryStatusFilter);
    if (paymentStatusFilter !== "all") next.set("payment", paymentStatusFilter);
    if (orderSourceFilter !== "all") next.set("source", orderSourceFilter);
    if (dateFilter !== "all") next.set("range", dateFilter);
    if (dateFrom) next.set("from", dateFrom);
    if (dateTo) next.set("to", dateTo);
    if (minTotal) next.set("min", minTotal);
    if (maxTotal) next.set("max", maxTotal);
    if (refundedOnly) next.set("refunded", "true");
    if (expiredOnly) next.set("expired", "true");
    if (sortBy !== "newest") next.set("sort", sortBy);
    if (page !== 1) next.set("page", String(page));
    if (pageSize !== 50) next.set("pageSize", String(pageSize));
    if (showFilters) next.set("filters", "open");
    const nextSearch = next.toString();
    if (nextSearch !== urlParams.toString()) {
      lastWrittenSearchRef.current = nextSearch;
      setUrlParams(next, { replace: true });
    }
  }, [
    dateFilter,
    dateFrom,
    dateTo,
    deliveryStatusFilter,
    expiredOnly,
    maxTotal,
    minTotal,
    orderSourceFilter,
    page,
    pageSize,
    paymentStatusFilter,
    refundedOnly,
    searchQuery,
    setUrlParams,
    showFilters,
    sortBy,
    urlParams,
  ]);

  const filterError = useMemo(() => {
    const minimum = minTotal === "" ? null : Number(minTotal);
    const maximum = maxTotal === "" ? null : Number(maxTotal);
    if (minimum !== null && (!Number.isFinite(minimum) || minimum < 0)) {
      return "Minimum total must be zero or greater.";
    }
    if (maximum !== null && (!Number.isFinite(maximum) || maximum < 0)) {
      return "Maximum total must be zero or greater.";
    }
    if (minimum !== null && maximum !== null && minimum > maximum) {
      return "Minimum total cannot exceed maximum total.";
    }
    if (dateFrom && dateTo && dateFrom > dateTo) {
      return "The From date cannot be later than the To date.";
    }
    return "";
  }, [dateFrom, dateTo, maxTotal, minTotal]);

  const toDateInputValue = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const mapSortToApi = (value: string): { sortBy?: string; sortOrder?: "asc" | "desc" } => {
    if (value === "newest") return { sortBy: "createdAt", sortOrder: "desc" };
    if (value === "oldest") return { sortBy: "createdAt", sortOrder: "asc" };
    if (value === "total-high") return { sortBy: "total", sortOrder: "desc" };
    if (value === "total-low") return { sortBy: "total", sortOrder: "asc" };
    if (value === "delivery") return { sortBy: "deliveryDate", sortOrder: "asc" };
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

    if (dateFilter === "today") {
      setDateFrom(toDateInputValue(startOfToday));
      setDateTo(toDateInputValue(endOfToday));
      return;
    }

    if (dateFilter === "week") {
      const from = new Date(startOfToday.getTime() - 7 * 86400000);
      setDateFrom(toDateInputValue(from));
      setDateTo(toDateInputValue(endOfToday));
      return;
    }

    if (dateFilter === "month") {
      const from = new Date(startOfToday.getTime() - 30 * 86400000);
      setDateFrom(toDateInputValue(from));
      setDateTo(toDateInputValue(endOfToday));
      return;
    }
  }, [dateFilter]);

const refresh = useCallback(
  async (opts?: { page?: number; pageSize?: number; signal?: AbortSignal }) => {
    const targetPage = opts?.page ?? page;
    const targetPageSize = opts?.pageSize ?? pageSize;

    const sort = mapSortToApi(sortBy);

    const effectiveDeliveryStatus =
      deliveryStatusFilter !== "all" ? deliveryStatusFilter : undefined;
    const effectivePaymentStatus =
      paymentStatusFilter !== "all" ? paymentStatusFilter : undefined;
    const effectiveOrderSource =
      orderSourceFilter !== "all" ? orderSourceFilter : undefined;

    const apiDateFrom = dateFrom ? toStartOfDayIso(dateFrom) : undefined;
    const apiDateTo = dateTo ? toEndOfDayIso(dateTo) : undefined;

    await listOrders({
      page: targetPage,
      pageSize: targetPageSize,

      // ✅ delivery status filter (optional)
      deliveryStatus: effectiveDeliveryStatus,
      paymentStatus: effectivePaymentStatus,
      orderSource: effectiveOrderSource,

      search: searchQuery || undefined,
      minTotal: minTotal || undefined,
      maxTotal: maxTotal || undefined,
      dateFrom: apiDateFrom,
      dateTo: apiDateTo,
      refundedOnly: refundedOnly ? true : undefined,
      expiredOnly: expiredOnly ? true : undefined,

      sortBy: sort.sortBy,
      sortOrder: sort.sortOrder,
    }, { signal: opts?.signal });
  },
  [
    listOrders,
    page,
    pageSize,
    sortBy,
    deliveryStatusFilter,
    paymentStatusFilter,
    orderSourceFilter,
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
  const filterKey = useMemo(() => JSON.stringify({
    searchQuery,
    deliveryStatusFilter,
    paymentStatusFilter,
    orderSourceFilter,
    dateFilter,
    minTotal,
    maxTotal,
    dateFrom,
    dateTo,
    refundedOnly,
    expiredOnly,
    sortBy,
  }), [
    dateFilter, dateFrom, dateTo, deliveryStatusFilter, expiredOnly, maxTotal,
    minTotal, orderSourceFilter, paymentStatusFilter, refundedOnly, searchQuery, sortBy,
  ]);

  useEffect(() => {
    const requestId = ++filterRequestIdRef.current;
    const controller = new AbortController();
    const filtersChanged = lastFilterKeyRef.current !== filterKey;
    lastFilterKeyRef.current = filterKey;

    if (filtersChanged) {
      setSelectedOrders([]);
      if (page !== 1) {
        setPage(1);
        return () => controller.abort();
      }
    }

    if (filterError) {
      setPendingFilters(false);
      return () => controller.abort();
    }

    setPendingFilters(true);

    const handle = window.setTimeout(async () => {
      try {
        await refresh({ signal: controller.signal });
      } catch (error: unknown) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ERR_CANCELED"
        ) {
          return;
        }
        // error state is tracked in context
      } finally {
        if (!controller.signal.aborted && filterRequestIdRef.current === requestId) {
          setPendingFilters(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [
    refresh,
    page,
    filterKey,
    filterError,
  ]);

  const orders = useMemo(() => adminOrders.map(mapAdminOrderToUi), [adminOrders]);

  // Backend already applies filters/sort; UI should render the server result.
  const filteredOrders = orders;

 const statusCounts = useMemo<Record<string, number>>(
  () => ({
    all: orders.length,
    ordered: orders.filter((o) => o.deliveryStatus === "ordered").length,
    dispatched: orders.filter((o) => o.deliveryStatus === "dispatched").length,
    in_transit: orders.filter((o) => o.deliveryStatus === "in_transit").length,
    delivered: orders.filter((o) => o.deliveryStatus === "delivered").length,
    returned: orders.filter((o) => o.deliveryStatus === "returned").length,
  }),
  [orders],
);


  const toggleOrderSelection = (id: string) => {
    setSelectedOrders((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredOrders.map((order) => order.id);
    setSelectedOrders((previous) => {
      const selected = new Set(previous);
      const allVisibleSelected =
        visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));

      visibleIds.forEach((id) => {
        if (allVisibleSelected) selected.delete(id);
        else selected.add(id);
      });

      return [...selected];
    });
  };

const bulkUpdateStatus = async (deliveryStatus: string) => {
  if (!selectedOrders.length) return;

  if (
    deliveryStatus !== "ordered" &&
    deliveryStatus !== "dispatched" &&
    deliveryStatus !== "in_transit" &&
    deliveryStatus !== "delivered" &&
    deliveryStatus !== "returned"
  ) {
    showToast({ title: "Unsupported delivery status", type: "error" });
    return;
  }

  try {
    const result = await bulkUpdateDeliveryStatusApi(
      selectedOrders,
      deliveryStatus,
    );

    showToast({
      title: `${result.modified} orders updated`,
      type: "success",
    });

    setSelectedOrders([]);
    await refresh(); // keeps current filters/paging
  } catch {
    showToast({ title: "Bulk update failed", type: "error" });
  }
};

  const toUtcMidnightIsoFromDateInput = (value: string) => {
    if (!value) return undefined;
    // If already ISO-ish, pass through.
    if (value.includes("T")) {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
    }
    // From <input type="date">: YYYY-MM-DD
    const dt = new Date(`${value}T00:00:00.000Z`);
    return Number.isNaN(dt.getTime()) ? undefined : dt.toISOString();
  };

  const bulkAssignDeliveryDate = async (dateInput: string) => {
    if (!selectedOrders.length) return;

    const deliveryDate = toUtcMidnightIsoFromDateInput(dateInput);
    if (!deliveryDate) {
      showToast({ title: "Choose a delivery date", type: "error" });
      return;
    }

    try {
      const result = await bulkAssignDeliveryDateApi(selectedOrders, deliveryDate);

      showToast({
        title: `${result.modified} orders updated`,
        type: "success",
      });

      setSelectedOrders([]);
      await refresh();
    } catch (error: unknown) {
      showToast({
        title: getErrorMessage(error, "Bulk assign delivery date failed"),
        type: "error",
      });
    }
  };

  const getOrdersStockRequirements = async (params?: {
    orderIds?: string[];
    ordersFile?: File;
    orderTypeScope?: "both" | "normal" | "subscription";
    deliveryDate?: string;
  }): Promise<OrdersStockRequirements | null> => {
    try {
      const data = await getOrdersStockRequirementsApi({
        orderIds: params?.orderIds,
        ordersFile: params?.ordersFile,
        orderTypeScope: params?.orderTypeScope,
        deliveryDate: params?.deliveryDate,
      });
      return data;
    } catch (error: unknown) {
      showToast({
        title: getErrorMessage(error, "Failed to calculate stock requirements"),
        type: "error",
      });
      return null;
    }
  };


  return {
    orders,
    loading: apiLoading || pendingFilters,
    error,
    filterError,
    meta,
    refresh,

    page,
    setPage,
    pageSize,
    setPageSize,

    searchQuery,
    setSearchQuery,
    deliveryStatusFilter,
    setDeliveryStatusFilter,
    paymentStatusFilter,
    setPaymentStatusFilter,
    orderSourceFilter,
    setOrderSourceFilter,
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
    showFilters,
    setShowFilters,

    filteredOrders,
    statusCounts,

    toggleOrderSelection,
    toggleSelectAll,
    bulkUpdateStatus,
    bulkAssignDeliveryDate,
    getOrdersStockRequirements,
  };
};

export type OrdersPageState = ReturnType<typeof useOrders>;
