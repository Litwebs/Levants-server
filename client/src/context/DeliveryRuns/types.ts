// Delivery Runs Types

export type RunStatus = 'draft' | 'locked' | 'routed' | 'dispatched' | 'completed';
// Support any number of vans (routes). We still only have 3 style/color variants,
// so extra vans cycle through the existing palette.
export type VanId = `van-${number}`;
export type IssueType = 'MISSING_GEO' | 'BAD_ADDRESS' | 'OUT_OF_RANGE' | 'CAPACITY_EXCEEDED';

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
  orderId: string;
  customerName: string;
  phone?: string;
  addressLine1: string;
  postcode: string;
  lat: number;
  lng: number;
  notes?: string;
  eta?: string;
  stopStatus?: 'pending' | 'delivered' | 'failed' | string;
  orderDeliveryStatus?: string;
  items: ManifestItem[];
}

export interface VanRoute {
  vanId: VanId;
  name: string;
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
  orderId: string;
  customerName: string;
  postcode: string;
  totalItems: number;
  lat?: number;
  lng?: number;
  issueTag?: IssueType;
}

export interface Issue {
  type: IssueType;
  message: string;
  orderId?: string;
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
