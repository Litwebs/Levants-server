// Delivery Runs Types

export type RunStatus = 'draft' | 'locked' | 'routed' | 'dispatched' | 'completed';
export type VanId = 'van-1' | 'van-2' | 'van-3';
export type IssueType = 'MISSING_GEO' | 'BAD_ADDRESS' | 'OUT_OF_RANGE' | 'CAPACITY_EXCEEDED';

export interface ManifestItem {
  skuId: string;
  name: string;
  qty: number;
  unit?: string;
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
}

// Depot configuration
export const DEPOT_LOCATION = {
  lat: 51.5074,
  lng: -0.1278,
  label: 'Depot'
};

// Van colors for map display
export const VAN_COLORS: Record<VanId, string> = {
  'van-1': '#1a5f4a',
  'van-2': '#e8a838',
  'van-3': '#3b82f6'
};

export const VAN_NAMES: Record<VanId, string> = {
  'van-1': 'Van 1',
  'van-2': 'Van 2',
  'van-3': 'Van 3'
};
