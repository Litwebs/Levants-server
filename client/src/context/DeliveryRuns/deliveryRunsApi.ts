import api from "@/context/api";
import axios from "axios";
import {
  DeliveryDriver,
  DeliveryRun,
  DeliveryRunListItem,
  GenerateRouteDriverConfig,
  IssueType,
  ListRunsParams,
  ManualOrderAssignment,
  CreateRunPayload,
  ManifestItem,
  OrderSummary,
  RouteStop,
  RunStatus,
  VanId,
  VanRoute,
} from "./types";

type ApiEnvelope<T> = { success: boolean; data?: T; message?: string };

type EligibleOrder = {
  id: string;
  orderId: string;
  customerName: string;
  phone?: string | null;
  postcode: string;
  addressLine1: string;
  lat?: number;
  lng?: number;
  totalItems: number;
};

type Driver = DeliveryDriver;
type DepotLocation = { lat: number; lng: number; label: string };

type OrdersStockRequirementsResponse = {
  sources?: {
    sheet?: {
      rows?: number;
      usableRows?: number;
    } | null;
  };
};

type BatchListItem = {
  id: string;
  deliveryDate: string;
  status: string;
  ordersCount: number;
  dropsCount: number;
  unassignedCount: number;
  distanceKm: number;
  durationMin: number;
  lastOptimizedAt?: string | null;
};

type BatchDetails = {
  _id: string;
  deliveryDate: string;
  status: string;
  deliveryWindowStart?: string;
  deliveryWindowEnd?: string;
  orders: any[];
  routes: any[];
  createdAt: string;
  lockedAt?: string;
  generatedAt?: string;
  routeGeneration?: {
    warnings?: Array<{
      type: string;
      message: string;
      orderId?: string;
      orderDbId?: string;
      driverId?: string;
      driverIds?: string[];
      postcode?: string;
    }>;
  };
};

type RouteDetails = {
  route: any;
  stops: any[];
};

type RouteStockItem = {
  variantId?: any;
  productId?: any;
  sku?: any;
  name?: any;
  unitPrice?: any;
  totalQuantity?: any;
  orders?: Array<{ orderId?: any; quantity?: any }>;
};

type RouteStockData = {
  routeId: string;
  totalUniqueProducts?: number;
  items: RouteStockItem[];
};

const unwrap = <T,>(payload: any): T => {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as ApiEnvelope<T>).data as T;
  }
  return payload as T;
};

const backendToUiStatus = (status: string): RunStatus => {
  switch (status) {
    case "collecting":
      return "draft";
    case "locked":
      return "locked";
    case "routes_generated":
      return "routed";
    case "dispatched":
      return "dispatched";
    case "completed":
      return "completed";
    default:
      return "draft";
  }
};

const uiToBackendStatus = (status: ListRunsParams["status"]): string | undefined => {
  if (!status || status === "all") return undefined;
  switch (status) {
    case "draft":
      return "collecting";
    case "locked":
      return "locked";
    case "routed":
      return "routes_generated";
    case "dispatched":
      return "dispatched";
    case "completed":
      return "completed";
    default:
      return undefined;
  }
};

const toVanId = (index: number): VanId => `van-${index + 1}` as VanId;

const normalizeRoutingArea = (value: string) =>
  String(value || "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();

const extractRoutingArea = (postcode: string) => {
  const compact = normalizeRoutingArea(postcode);
  if (!compact) return "";

  const match = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  return match ? match[1] : compact;
};

const ISSUE_TYPES: IssueType[] = [
  "MISSING_GEO",
  "BAD_ADDRESS",
  "OUT_OF_RANGE",
  "CAPACITY_EXCEEDED",
  "NO_DRIVER_MATCH",
  "MULTIPLE_DRIVER_MATCH",
  "DRIVER_POSTCODE_AREAS_MISSING",
  "DRIVER_START_TIME_MISSING",
];

const isIssueType = (value: unknown): value is IssueType =>
  typeof value === "string" && ISSUE_TYPES.includes(value as IssueType);

const manifestFromStops = (stops: RouteStop[]): ManifestItem[] => {
  const map = new Map<string, ManifestItem>();
  for (const stop of stops) {
    for (const item of stop.items || []) {
      const key = item.skuId;
      const existing = map.get(key);
      if (existing) {
        existing.qty += item.qty;
      } else {
        map.set(key, { skuId: item.skuId, name: item.name, qty: item.qty, unit: item.unit });
      }
    }
  }
  return Array.from(map.values());
};

const manifestFromRouteStock = (stock: RouteStockData | null | undefined): ManifestItem[] => {
  const items = Array.isArray(stock?.items) ? stock!.items : [];
  return items
    .map((it) => {
      const skuId = String(it?.sku ?? it?.variantId ?? it?.productId ?? '');
      return {
        skuId,
        name: String(it?.name ?? ''),
        qty: Number(it?.totalQuantity ?? 0),
        ordersCount: Array.isArray(it?.orders) ? it.orders.length : undefined,
      };
    })
    .filter((it) => it.skuId || it.name)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
};

const mapStops = (stops: any[]): RouteStop[] => {
  return (stops || []).map((s: any) => {
    const order = s.order;
    const customer = order?.customer;
    const customerName = customer && typeof customer === "object"
      ? `${customer.firstName || ""} ${customer.lastName || ""}`.trim()
      : "";
    const phone = customer && typeof customer === "object" ? customer.phone : undefined;

    const items: ManifestItem[] = Array.isArray(order?.items)
      ? order.items.map((it: any) => ({
          skuId: String(it?.sku ?? it?.variant ?? it?.product ?? ""),
          name: String(it?.name ?? ""),
          qty: Number(it?.quantity ?? 0),
        }))
      : [];

    const orderIsManualImport = Boolean(order?.metadata?.manualImport);
    const orderIsStripeBacked = Boolean(
      order?.stripeCheckoutSessionId || order?.stripePaymentIntentId,
    );

    return {
      stopId: String(s._id),
      sequence: Number(s.sequence ?? 0),
      orderDbId: order?._id ? String(order._id) : undefined,
      orderId: String(order?.orderId ?? ""),
      customerName,
      phone: phone ?? undefined,
      addressLine1: String(order?.deliveryAddress?.line1 ?? ""),
      postcode: String(order?.deliveryAddress?.postcode ?? ""),
      lat: Number(order?.location?.lat ?? 0),
      lng: Number(order?.location?.lng ?? 0),
      orderTotal:
        typeof order?.total === "number" && Number.isFinite(order.total)
          ? order.total
          : undefined,
      orderPaymentStatus: typeof order?.status === "string" ? order.status : undefined,
      orderIsManualImport,
      orderIsStripeBacked,
      navigationUrl:
        typeof s?.navigationUrl === "string" ? s.navigationUrl : undefined,
      notes:
        typeof order?.customerInstructions === "string" &&
        order.customerInstructions.trim().length > 0
          ? order.customerInstructions.trim()
          : undefined,
      eta: s.estimatedArrival
        ? new Date(s.estimatedArrival).toISOString()
        : undefined,
      stopStatus: typeof s?.status === "string" ? s.status : undefined,
      orderDeliveryStatus: typeof order?.deliveryStatus === "string" ? order.deliveryStatus : undefined,
      items,
    };
  });
};

const mapBatchOrderSummary = (order: any, issueTag?: IssueType): OrderSummary => {
  const customer = order?.customer;
  const customerName = customer && typeof customer === "object"
    ? `${customer.firstName || ""} ${customer.lastName || ""}`.trim()
    : "";

  const totalItems = Array.isArray(order?.items)
    ? order.items.reduce((sum: number, it: any) => sum + Number(it?.quantity ?? 0), 0)
    : 0;

  const postcode = String(order?.deliveryAddress?.postcode ?? "");
  const hasGeo = order?.location?.lat != null && order?.location?.lng != null;

  return {
    orderDbId: order?._id ? String(order._id) : undefined,
    orderId: String(order?.orderId ?? ""),
    customerName,
    addressLine1: String(order?.deliveryAddress?.line1 ?? ""),
    postcode,
    routingArea: extractRoutingArea(postcode),
    totalItems,
    lat: hasGeo ? order.location.lat : undefined,
    lng: hasGeo ? order.location.lng : undefined,
    issueTag,
  };
};

async function buildRunFromBatch(batch: BatchDetails): Promise<DeliveryRun> {
  const routes = Array.isArray(batch.routes) ? batch.routes : [];

  const vans: VanRoute[] = [];
  const assignedOrderIds = new Set<string>();

  for (let i = 0; i < routes.length; i++) {
    const route = routes[i];
    const routeId = String(route._id);
    const routeRes = await api.get(`/admin/delivery/route/${routeId}`);
    const routeData = unwrap<RouteDetails>(routeRes.data);
    const mappedStops = mapStops(routeData?.stops || []);

    let stockManifest: ManifestItem[] | null = null;
    try {
      const stockRes = await api.get(`/admin/delivery/route/${routeId}/stock`);
      const stockData = unwrap<RouteStockData>(stockRes.data);
      const built = manifestFromRouteStock(stockData);
      stockManifest = built.length ? built : null;
    } catch {
      stockManifest = null;
    }

    for (const st of routeData?.stops || []) {
      if (st?.order?._id) assignedOrderIds.add(String(st.order._id));
    }

    const vanId = toVanId(i);
    const driverId = route?.driver?._id ? String(route.driver._id) : undefined;
    const driverName =
      typeof route?.driver?.name === "string" ? route.driver.name : undefined;
    const driverEmail =
      typeof route?.driver?.email === "string" ? route.driver.email : undefined;
    vans.push({
      vanId,
      name: driverName || `Van ${i + 1}`,
      driverId,
      driverName,
      driverEmail,
      stats: {
        stops: Number(route?.totalStops ?? mappedStops.length ?? 0),
        distanceKm: Number(route?.totalDistanceMeters ?? 0) / 1000,
        durationMin: Number(route?.totalDurationSeconds ?? 0) / 60,
      },
      stops: mappedStops,
      manifest: {
        items: stockManifest ?? manifestFromStops(mappedStops),
        itemsByStop: mappedStops.map((s) => ({ stopId: s.stopId, items: s.items })),
      },
    });
  }

  const orders = Array.isArray(batch.orders) ? batch.orders : [];
  const warnings = Array.isArray(batch.routeGeneration?.warnings)
    ? batch.routeGeneration.warnings
    : [];
  const warningByOrderDbId = new Map<string, IssueType>();

  for (const warning of warnings) {
    const key = typeof warning?.orderDbId === "string" ? warning.orderDbId : "";
    if (!key || warningByOrderDbId.has(key)) continue;
    if (isIssueType(warning?.type)) {
      warningByOrderDbId.set(key, warning.type);
    }
  }

  const allOrders: OrderSummary[] = orders.map((o: any) => {
    const issueTag = warningByOrderDbId.get(String(o?._id || ""));
    const hasGeo = o?.location?.lat != null && o?.location?.lng != null;

    return mapBatchOrderSummary(o, issueTag || (hasGeo ? undefined : "MISSING_GEO"));
  });

  const unassignedOrders: OrderSummary[] = allOrders.filter(
    (order) => !assignedOrderIds.has(String(order.orderDbId || "")),
  );

  const totalDistanceKm = vans.reduce((sum, v) => sum + (v.stats.distanceKm || 0), 0);
  const totalDurationMin = vans.reduce((sum, v) => sum + (v.stats.durationMin || 0), 0);
  const dropsCount = vans.reduce((sum, v) => sum + (v.stats.stops || 0), 0);

  return {
    id: String(batch._id),
    deliveryDate: batch.deliveryDate,
    status: backendToUiStatus(batch.status),
    createdAt: batch.createdAt,
    lockedAt: batch.lockedAt,
    lastOptimizedAt: batch.generatedAt,
    deliveryWindowStart:
      typeof batch.deliveryWindowStart === "string" ? batch.deliveryWindowStart : undefined,
    deliveryWindowEnd:
      typeof batch.deliveryWindowEnd === "string" ? batch.deliveryWindowEnd : undefined,
    totals: {
      ordersCount: orders.length,
      dropsCount,
      unassignedCount: unassignedOrders.length,
      estimatedDistanceKm: totalDistanceKm,
      estimatedDurationMin: totalDurationMin,
    },
    vans,
    allOrders,
    unassignedOrders,
    issues: warnings
      .filter((warning: any) => isIssueType(warning?.type))
      .map((warning: any) => ({
        type: warning.type,
        message: String(warning.message || ""),
        orderId: warning.orderId,
        orderDbId: warning.orderDbId,
        driverId: warning.driverId,
        driverIds: Array.isArray(warning.driverIds) ? warning.driverIds : undefined,
        postcode: warning.postcode,
      })),
  };
}

// ============================================
// API Functions
// To wire to real endpoints, replace mock calls with fetch/axios calls:
//
// Example:
// export const listRuns = async (params?: ListRunsParams): Promise<DeliveryRunListItem[]> => {
//   const response = await fetch('/api/delivery-runs?' + new URLSearchParams(params as any));
//   if (!response.ok) throw new Error('Failed to fetch runs');
//   return response.json();
// };
// ============================================

/**
 * List all delivery runs with optional filters
 * GET /api/delivery-runs?fromDate=&toDate=&status=
 */
export const listRuns = async (params?: ListRunsParams): Promise<DeliveryRunListItem[]> => {
  const res = await api.get("/admin/delivery/batches", {
    params: {
      fromDate: params?.fromDate,
      toDate: params?.toDate,
      status: uiToBackendStatus(params?.status),
    },
  });

  const data = unwrap<{ batches: BatchListItem[] }>(res.data);
  const batches = data?.batches ?? [];

  return batches.map((b) => ({
    id: String(b.id),
    deliveryDate: b.deliveryDate,
    status: backendToUiStatus(b.status),
    ordersCount: b.ordersCount,
    dropsCount: b.dropsCount,
    unassignedCount: b.unassignedCount,
    distanceKm: b.distanceKm,
    durationMin: b.durationMin,
    lastOptimizedAt: b.lastOptimizedAt ?? undefined,
  }));
};

/**
 * Get a single delivery run by ID
 * GET /api/delivery-runs/:id
 */
export const getRun = async (id: string): Promise<DeliveryRun | null> => {
  const res = await api.get(`/admin/delivery/batch/${id}`);
  const batch = unwrap<BatchDetails>(res.data);
  if (!batch?._id) return null;
  return buildRunFromBatch(batch);
};

/**
 * Create a new delivery run
 * POST /api/delivery-runs
 */
export const createRun = async (payload: CreateRunPayload): Promise<DeliveryRun> => {
  try {
    const hasFile = Boolean((payload as any)?.ordersFile);

    const res = hasFile
      ? await api.post(
          "/admin/delivery/batch",
          (() => {
            const form = new FormData();
            form.append("deliveryDate", payload.deliveryDate);
            if ((payload as any).startTime) {
              form.append("startTime", String((payload as any).startTime));
            }
            if (Array.isArray((payload as any).orderIds)) {
              form.append("orderIds", JSON.stringify((payload as any).orderIds));
            }
            form.append("ordersFile", (payload as any).ordersFile);
            return form;
          })(),
          { headers: { "Content-Type": "multipart/form-data" } },
        )
      : await api.post("/admin/delivery/batch", {
          deliveryDate: payload.deliveryDate,
          orderIds: (payload as any).orderIds,
          startTime: (payload as any).startTime,
        });
    const data = unwrap<{ batchId: string }>(res.data);
    const batchId = (data as any)?.batchId as string;
    const run = await getRun(batchId);
    if (!run) throw new Error("Failed to load created run");
    return run;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const message = (err.response?.data as any)?.message;
      if (typeof message === 'string' && message.trim()) {
        throw new Error(message);
      }
    }
    throw err;
  }
};

/**
 * Lock a delivery run (prevent automatic changes)
 * PATCH /api/delivery-runs/:id/lock
 */
export const lockRun = async (id: string): Promise<DeliveryRun | null> => {
  await api.patch(`/admin/delivery/batch/${id}/lock`);
  return getRun(id);
};

/**
 * Unlock a delivery run
 * PATCH /api/delivery-runs/:id/unlock
 */
export const unlockRun = async (id: string): Promise<DeliveryRun | null> => {
  await api.patch(`/admin/delivery/batch/${id}/unlock`);
  return getRun(id);
};

/**
 * Optimize routes for a delivery run
 * POST /api/delivery-runs/:id/optimize
 */
export const optimizeRun = async (
  id: string,
  driverConfigs: GenerateRouteDriverConfig[],
  manualAssignments: ManualOrderAssignment[] = [],
): Promise<DeliveryRun | null> => {
  try {
    const payload = {
      driverIds: driverConfigs.map((config) => config.driverId),
      driverConfigs,
      manualAssignments,
    };

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[deliveryRunsApi.optimizeRun] payload", { id, ...payload });
    }

    await api.post(`/admin/delivery/batch/${id}/generate-routes`, payload);
    return getRun(id);
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const message = (err.response?.data as any)?.message;
      if (typeof message === "string" && message.trim()) {
        throw new Error(message);
      }
    }
    throw err;
  }
};

/**
 * Dispatch a delivery run
 * PATCH /api/delivery-runs/:id/dispatch
 */
export const dispatchRun = async (id: string): Promise<DeliveryRun | null> => {
  await api.patch(`/admin/delivery/batch/${id}/dispatch`);
  return getRun(id);
};

/**
 * Delete a delivery run (batch) and its routes/stops
 * DELETE /api/admin/delivery/batch/:id
 */
export const deleteRun = async (id: string): Promise<void> => {
  try {
    await api.delete(`/admin/delivery/batch/${id}`);
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const message = (err.response?.data as any)?.message;
      if (typeof message === "string" && message.trim()) {
        throw new Error(message);
      }
    }
    throw err;
  }
};

export const listEligibleOrders = async (deliveryDate: string): Promise<EligibleOrder[]> => {
  const res = await api.get("/admin/delivery/eligible-orders", { params: { deliveryDate } });
  const data = unwrap<{ orders: EligibleOrder[] }>(res.data);
  return data?.orders ?? [];
};

export const listDrivers = async (): Promise<Driver[]> => {
  const res = await api.get("/admin/delivery/drivers");
  const data = unwrap<{ drivers: Driver[] }>(res.data);
  return data?.drivers ?? [];
};

export const getImportedOrdersCount = async (ordersFile: File): Promise<number> => {
  const form = new FormData();
  form.append("ordersFile", ordersFile);

  const res = await api.post("/admin/delivery/orders/stock", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  const data = unwrap<OrdersStockRequirementsResponse>(res.data);
  const usableRows = Number(data?.sources?.sheet?.usableRows ?? 0);
  const rows = Number(data?.sources?.sheet?.rows ?? 0);

  return Number.isFinite(usableRows) && usableRows > 0 ? usableRows : rows;
};

export const reassignStopDriver = async (
  stopId: string,
  driverId: string,
): Promise<void> => {
  try {
    await api.patch(`/admin/delivery/stops/${stopId}/driver`, { driverId });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const message = (err.response?.data as any)?.message;
      if (typeof message === "string" && message.trim()) {
        throw new Error(message);
      }
    }
    throw err;
  }
};

export const getDepotLocation = async (): Promise<DepotLocation | null> => {
  const res = await api.get("/admin/delivery/depot");
  const data = unwrap<DepotLocation>(res.data);
  if (!data || typeof data.lat !== 'number' || typeof data.lng !== 'number') return null;
  return data;
};

/**
 * Get printable data for a van
 * GET /api/delivery-runs/:runId/vans/:vanId/print
 */
export const getVanPrintData = async (runId: string, vanId: string) => {
  const run = await getRun(runId);
  if (!run) return null;
  const van = run.vans.find((v) => v.vanId === (vanId as any));
  return van || null;
};
