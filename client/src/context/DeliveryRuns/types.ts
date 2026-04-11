// Delivery Runs Types

export type RunStatus = 'draft' | 'locked' | 'routed' | 'dispatched' | 'completed';
// Support any number of vans (routes). We still only have 3 style/color variants,
// so extra vans cycle through the existing palette.
export type VanId = `van-${number}`;
export type IssueType =
  | 'MISSING_GEO'
  | 'BAD_ADDRESS'
  | 'OUT_OF_RANGE'
  | 'CAPACITY_EXCEEDED'
  | 'NO_DRIVER_MATCH'
  | 'MULTIPLE_DRIVER_MATCH'
  | 'DRIVER_POSTCODE_AREAS_MISSING'
  | 'DRIVER_START_TIME_MISSING';

export interface DriverRoutingConfig {
  postcodeAreas: string[];
  routeStartTime?: string | null;
}

export interface DeliveryDriver {
  id: string;
  name: string;
  email: string;
  driverRouting: DriverRoutingConfig;
}

export interface GenerateRouteDriverConfig {
  driverId: string;
  postcodeAreas: string[];
  routeStartTime: string;
}

export interface ManualOrderAssignment {
  orderDbId: string;
  driverId: string;
}

export interface ManifestItem {
  skuId: string;
  name: string;
  qty: number;
  unit?: string;
  ordersCount?: number;
}

export interface RouteStop {
  stopId: string;
  sequence: number;
  /** Internal DB id for the order (used for admin status updates) */
  orderDbId?: string;
  orderId: string;
  customerName: string;
  phone?: string;
  addressLine1: string;
  postcode: string;
  lat: number;
  lng: number;
  /** Order total amount (used for driver stop list) */
  orderTotal?: number;
  /** Payment status for the order (e.g. paid/pending/refunded) */
  orderPaymentStatus?: string;
  /** Whether this order was created via spreadsheet/manual import */
  orderIsManualImport?: boolean;
  /** Whether this order is backed by Stripe (then payment status is locked) */
  orderIsStripeBacked?: boolean;
  /** Optional server-provided navigation link */
  navigationUrl?: string;
  notes?: string;
  eta?: string;
  stopStatus?: 'pending' | 'delivered' | 'failed' | string;
  orderDeliveryStatus?: string;
  items: ManifestItem[];
}

export interface VanRoute {
  vanId: VanId;
  name: string;
  driverId?: string;
  driverName?: string;
  driverEmail?: string;
  stats: {
    stops: number;
    distanceKm: number;
    durationMin: number;
  };
  stops: RouteStop[];
  manifest: {
    items: ManifestItem[];
    itemsByStop?: { stopId: string; items: ManifestItem[] }[];
  };
}

export interface OrderSummary {
  orderDbId?: string;
  orderId: string;
  customerName: string;
  addressLine1?: string;
  postcode: string;
  routingArea?: string;
  totalItems: number;
  lat?: number;
  lng?: number;
  issueTag?: IssueType;
}

export interface Issue {
  type: IssueType;
  message: string;
  orderId?: string;
  orderDbId?: string;
  driverId?: string;
  driverIds?: string[];
  postcode?: string;
}

export interface RunTotals {
  ordersCount: number;
  dropsCount: number;
  unassignedCount: number;
  estimatedDistanceKm: number;
  estimatedDurationMin: number;
}

export interface DeliveryRun {
  id: string;
  deliveryDate: string;
  status: RunStatus;
  createdAt: string;
  lockedAt?: string;
  lastOptimizedAt?: string;
  deliveryWindowStart?: string;
  deliveryWindowEnd?: string;
  totals: RunTotals;
  vans: VanRoute[];
  allOrders?: OrderSummary[];
  unassignedOrders: OrderSummary[];
  issues: Issue[];
}

export interface DeliveryRunListItem {
  id: string;
  deliveryDate: string;
  status: RunStatus;
  ordersCount: number;
  dropsCount: number;
  unassignedCount: number;
  distanceKm: number;
  durationMin: number;
  lastOptimizedAt?: string;
}

export interface ListRunsParams {
  fromDate?: string;
  toDate?: string;
  status?: RunStatus | 'all';
}

export interface CreateRunPayload {
  deliveryDate: string;
  orderIds?: string[];
  startTime?: string;
  ordersFile?: File | null;
}

// Depot configuration
export const DEPOT_LOCATION = {
  lat: 51.5074,
  lng: -0.1278,
  label: 'Depot'
};

const VAN_COLOR_PALETTE = ['#1a5f4a', '#e8a838', '#3b82f6'] as const;
const VAN_STYLE_KEYS = ['van1', 'van2', 'van3'] as const;

export const getVanIndex = (vanId: VanId): number => {
  const match = String(vanId).match(/van-(\d+)/i);
  const n = match ? Number(match[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
};

export const getVanColor = (vanId: VanId): string => {
  const idx = getVanIndex(vanId);
  return VAN_COLOR_PALETTE[(idx - 1) % VAN_COLOR_PALETTE.length];
};

export const getVanDisplayName = (vanId: VanId): string => {
  return `Van ${getVanIndex(vanId)}`;
};

export const getVanStyleKey = (vanId: VanId): (typeof VAN_STYLE_KEYS)[number] => {
  const idx = getVanIndex(vanId);
  return VAN_STYLE_KEYS[(idx - 1) % VAN_STYLE_KEYS.length];
};
