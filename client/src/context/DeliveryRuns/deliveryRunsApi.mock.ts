// Mock data and API responses for Delivery Runs
import { 
  DeliveryRun, 
  DeliveryRunListItem, 
  VanRoute, 
  RouteStop, 
  ManifestItem,
  Issue,
  OrderSummary,
  VanId 
} from "./types";

// Helper to generate random stops
const generateStops = (vanId: VanId, count: number): RouteStop[] => {
  const baseCoords = { lat: 51.5074, lng: -0.1278 };
  const stops: RouteStop[] = [];
  
  const productNames = [
    'Whole Milk 2L', 'Semi-Skimmed Milk 1L', 'Double Cream 500ml',
    'Salted Butter 250g', 'Cheddar Cheese 400g', 'Greek Yogurt 500g',
    'Free Range Eggs x12', 'Clotted Cream 200ml', 'Fresh Cream 1L'
  ];

  for (let i = 0; i < count; i++) {
    const items: ManifestItem[] = [];
    const itemCount = Math.floor(Math.random() * 4) + 1;
    
    for (let j = 0; j < itemCount; j++) {
      items.push({
        skuId: `SKU-${String(Math.floor(Math.random() * 1000)).padStart(4, '0')}`,
        name: productNames[Math.floor(Math.random() * productNames.length)],
        qty: Math.floor(Math.random() * 5) + 1,
        unit: 'unit'
      });
    }

    stops.push({
      stopId: `${vanId}-stop-${i + 1}`,
      sequence: i + 1,
      orderId: `ORD-${String(Math.floor(Math.random() * 10000)).padStart(5, '0')}`,
      customerName: [
        'Sarah Johnson', 'Michael Chen', 'Emma Williams', 'James Brown',
        'Olivia Davis', 'William Taylor', 'Sophia Martinez', 'Benjamin Lee',
        'Isabella Anderson', 'Lucas Thomas', 'Mia Jackson', 'Henry White'
      ][Math.floor(Math.random() * 12)],
      phone: `07${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`,
      addressLine1: `${Math.floor(Math.random() * 200) + 1} ${['High Street', 'Church Road', 'Mill Lane', 'Park Avenue', 'Oak Drive', 'Elm Close'][Math.floor(Math.random() * 6)]}`,
      postcode: `SW${Math.floor(Math.random() * 20) + 1} ${Math.floor(Math.random() * 9) + 1}${['AA', 'AB', 'BA', 'BB', 'CA', 'CB'][Math.floor(Math.random() * 6)]}`,
      lat: baseCoords.lat + (Math.random() - 0.5) * 0.15,
      lng: baseCoords.lng + (Math.random() - 0.5) * 0.25,
      notes: Math.random() > 0.7 ? 'Leave with neighbour if not home' : undefined,
      eta: `${9 + Math.floor(i * 0.5)}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}`,
      items
    });
  }
  
  return stops;
};

// Generate manifest from stops
const generateManifest = (stops: RouteStop[]): VanRoute['manifest'] => {
  const itemMap = new Map<string, ManifestItem>();
  
  stops.forEach(stop => {
    stop.items.forEach(item => {
      const existing = itemMap.get(item.skuId);
      if (existing) {
        existing.qty += item.qty;
      } else {
        itemMap.set(item.skuId, { ...item });
      }
    });
  });
  
  return {
    items: Array.from(itemMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    itemsByStop: stops.map(stop => ({
      stopId: stop.stopId,
      items: stop.items
    }))
  };
};

// Generate van routes
const generateVanRoutes = (): VanRoute[] => {
  const vanIds: VanId[] = ['van-1', 'van-2', 'van-3'];
  
  return vanIds.map(vanId => {
    const stopCount = Math.floor(Math.random() * 10) + 12; // 12-22 stops
    const stops = generateStops(vanId, stopCount);
    const distanceKm = Math.round((stopCount * 2.5 + Math.random() * 10) * 10) / 10;
    const durationMin = Math.round(stopCount * 8 + Math.random() * 30);
    
    return {
      vanId,
      name: `Van ${vanId.split('-')[1]}`,
      stats: {
        stops: stopCount,
        distanceKm,
        durationMin
      },
      stops,
      manifest: generateManifest(stops)
    };
  });
};

// Mock delivery runs data
const generateMockRuns = (): DeliveryRun[] => {
  const today = new Date();
  const runs: DeliveryRun[] = [];
  
  // Draft run - tomorrow
  const draftDate = new Date(today);
  draftDate.setDate(draftDate.getDate() + 1);
  runs.push({
    id: 'run-001',
    deliveryDate: draftDate.toISOString().split('T')[0],
    status: 'draft',
    createdAt: new Date(today.getTime() - 3600000).toISOString(),
    totals: {
      ordersCount: 45,
      dropsCount: 0,
      unassignedCount: 45,
      estimatedDistanceKm: 0,
      estimatedDurationMin: 0
    },
    vans: [],
    unassignedOrders: Array.from({ length: 45 }, (_, i) => ({
      orderId: `ORD-${String(1000 + i).padStart(5, '0')}`,
      customerName: `Customer ${i + 1}`,
      postcode: `SW${Math.floor(Math.random() * 20) + 1} ${Math.floor(Math.random() * 9) + 1}AA`,
      totalItems: Math.floor(Math.random() * 8) + 1,
      lat: 51.5074 + (Math.random() - 0.5) * 0.15,
      lng: -0.1278 + (Math.random() - 0.5) * 0.25
    })),
    issues: [
      { type: 'MISSING_GEO', message: 'Missing coordinates for delivery address', orderId: 'ORD-01003' },
      { type: 'BAD_ADDRESS', message: 'Invalid postcode format', orderId: 'ORD-01015' }
    ]
  });
  
  // Locked run - day after tomorrow
  const lockedDate = new Date(today);
  lockedDate.setDate(lockedDate.getDate() + 3);
  runs.push({
    id: 'run-002',
    deliveryDate: lockedDate.toISOString().split('T')[0],
    status: 'locked',
    createdAt: new Date(today.getTime() - 86400000).toISOString(),
    lockedAt: new Date(today.getTime() - 43200000).toISOString(),
    totals: {
      ordersCount: 52,
      dropsCount: 0,
      unassignedCount: 52,
      estimatedDistanceKm: 0,
      estimatedDurationMin: 0
    },
    vans: [],
    unassignedOrders: Array.from({ length: 52 }, (_, i) => ({
      orderId: `ORD-${String(2000 + i).padStart(5, '0')}`,
      customerName: `Customer ${i + 1}`,
      postcode: `E${Math.floor(Math.random() * 18) + 1} ${Math.floor(Math.random() * 9) + 1}BB`,
      totalItems: Math.floor(Math.random() * 8) + 1
    })),
    issues: []
  });
  
  // Routed run - 4 days from now
  const routedDate = new Date(today);
  routedDate.setDate(routedDate.getDate() + 5);
  const routedVans = generateVanRoutes();
  const routedTotalStops = routedVans.reduce((sum, v) => sum + v.stats.stops, 0);
  const routedTotalDistance = routedVans.reduce((sum, v) => sum + v.stats.distanceKm, 0);
  const routedTotalDuration = routedVans.reduce((sum, v) => sum + v.stats.durationMin, 0);
  runs.push({
    id: 'run-003',
    deliveryDate: routedDate.toISOString().split('T')[0],
    status: 'routed',
    createdAt: new Date(today.getTime() - 172800000).toISOString(),
    lockedAt: new Date(today.getTime() - 129600000).toISOString(),
    lastOptimizedAt: new Date(today.getTime() - 86400000).toISOString(),
    totals: {
      ordersCount: routedTotalStops + 3,
      dropsCount: routedTotalStops,
      unassignedCount: 3,
      estimatedDistanceKm: Math.round(routedTotalDistance * 10) / 10,
      estimatedDurationMin: routedTotalDuration
    },
    vans: routedVans,
    unassignedOrders: [
      { orderId: 'ORD-03001', customerName: 'John Doe', postcode: 'N1 1AA', totalItems: 4, issueTag: 'OUT_OF_RANGE' },
      { orderId: 'ORD-03002', customerName: 'Jane Smith', postcode: 'SE1 ???', totalItems: 2, issueTag: 'BAD_ADDRESS' },
      { orderId: 'ORD-03003', customerName: 'Bob Wilson', postcode: 'W1 2AB', totalItems: 12, issueTag: 'CAPACITY_EXCEEDED' }
    ],
    issues: [
      { type: 'OUT_OF_RANGE', message: 'Delivery address is outside service area', orderId: 'ORD-03001' },
      { type: 'BAD_ADDRESS', message: 'Invalid postcode format', orderId: 'ORD-03002' },
      { type: 'CAPACITY_EXCEEDED', message: 'Order too large for single delivery', orderId: 'ORD-03003' }
    ]
  });
  
  // Dispatched run - yesterday
  const dispatchedDate = new Date(today);
  dispatchedDate.setDate(dispatchedDate.getDate() - 1);
  const dispatchedVans = generateVanRoutes();
  const dispatchedTotalStops = dispatchedVans.reduce((sum, v) => sum + v.stats.stops, 0);
  const dispatchedTotalDistance = dispatchedVans.reduce((sum, v) => sum + v.stats.distanceKm, 0);
  const dispatchedTotalDuration = dispatchedVans.reduce((sum, v) => sum + v.stats.durationMin, 0);
  runs.push({
    id: 'run-004',
    deliveryDate: dispatchedDate.toISOString().split('T')[0],
    status: 'dispatched',
    createdAt: new Date(today.getTime() - 259200000).toISOString(),
    lockedAt: new Date(today.getTime() - 216000000).toISOString(),
    lastOptimizedAt: new Date(today.getTime() - 172800000).toISOString(),
    totals: {
      ordersCount: dispatchedTotalStops,
      dropsCount: dispatchedTotalStops,
      unassignedCount: 0,
      estimatedDistanceKm: Math.round(dispatchedTotalDistance * 10) / 10,
      estimatedDurationMin: dispatchedTotalDuration
    },
    vans: dispatchedVans,
    unassignedOrders: [],
    issues: []
  });
  
  // Completed run - 3 days ago
  const completedDate = new Date(today);
  completedDate.setDate(completedDate.getDate() - 3);
  const completedVans = generateVanRoutes();
  const completedTotalStops = completedVans.reduce((sum, v) => sum + v.stats.stops, 0);
  const completedTotalDistance = completedVans.reduce((sum, v) => sum + v.stats.distanceKm, 0);
  const completedTotalDuration = completedVans.reduce((sum, v) => sum + v.stats.durationMin, 0);
  runs.push({
    id: 'run-005',
    deliveryDate: completedDate.toISOString().split('T')[0],
    status: 'completed',
    createdAt: new Date(today.getTime() - 432000000).toISOString(),
    lockedAt: new Date(today.getTime() - 388800000).toISOString(),
    lastOptimizedAt: new Date(today.getTime() - 345600000).toISOString(),
    totals: {
      ordersCount: completedTotalStops,
      dropsCount: completedTotalStops,
      unassignedCount: 0,
      estimatedDistanceKm: Math.round(completedTotalDistance * 10) / 10,
      estimatedDurationMin: completedTotalDuration
    },
    vans: completedVans,
    unassignedOrders: [],
    issues: []
  });
  
  return runs;
};

// Store mock data
let mockRuns = generateMockRuns();

// Helper to simulate API delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Mock API functions
export const mockListRuns = async (params?: { fromDate?: string; toDate?: string; status?: string }): Promise<DeliveryRunListItem[]> => {
  await delay(300);
  
  let filtered = [...mockRuns];
  
  if (params?.fromDate) {
    filtered = filtered.filter(r => r.deliveryDate >= params.fromDate!);
  }
  if (params?.toDate) {
    filtered = filtered.filter(r => r.deliveryDate <= params.toDate!);
  }
  if (params?.status && params.status !== 'all') {
    filtered = filtered.filter(r => r.status === params.status);
  }
  
  return filtered.map(r => ({
    id: r.id,
    deliveryDate: r.deliveryDate,
    status: r.status,
    ordersCount: r.totals.ordersCount,
    dropsCount: r.totals.dropsCount,
    unassignedCount: r.totals.unassignedCount,
    distanceKm: r.totals.estimatedDistanceKm,
    durationMin: r.totals.estimatedDurationMin,
    lastOptimizedAt: r.lastOptimizedAt
  })).sort((a, b) => b.deliveryDate.localeCompare(a.deliveryDate));
};

export const mockGetRun = async (id: string): Promise<DeliveryRun | null> => {
  await delay(200);
  return mockRuns.find(r => r.id === id) || null;
};

export const mockCreateRun = async (deliveryDate: string): Promise<DeliveryRun> => {
  await delay(400);
  
  const newRun: DeliveryRun = {
    id: `run-${String(mockRuns.length + 1).padStart(3, '0')}`,
    deliveryDate,
    status: 'draft',
    createdAt: new Date().toISOString(),
    totals: {
      ordersCount: Math.floor(Math.random() * 30) + 20,
      dropsCount: 0,
      unassignedCount: 0,
      estimatedDistanceKm: 0,
      estimatedDurationMin: 0
    },
    vans: [],
    unassignedOrders: [],
    issues: []
  };
  
  // Set unassigned to match orders
  newRun.totals.unassignedCount = newRun.totals.ordersCount;
  newRun.unassignedOrders = Array.from({ length: newRun.totals.ordersCount }, (_, i) => ({
    orderId: `ORD-${String(Date.now() + i).slice(-5)}`,
    customerName: `Customer ${i + 1}`,
    postcode: `SW${Math.floor(Math.random() * 20) + 1} ${Math.floor(Math.random() * 9) + 1}AA`,
    totalItems: Math.floor(Math.random() * 8) + 1,
    lat: 51.5074 + (Math.random() - 0.5) * 0.15,
    lng: -0.1278 + (Math.random() - 0.5) * 0.25
  }));
  
  mockRuns.push(newRun);
  return newRun;
};

export const mockLockRun = async (id: string): Promise<DeliveryRun | null> => {
  await delay(300);
  
  const run = mockRuns.find(r => r.id === id);
  if (!run) return null;
  
  run.status = 'locked';
  run.lockedAt = new Date().toISOString();
  
  return run;
};

export const mockOptimizeRun = async (id: string): Promise<DeliveryRun | null> => {
  await delay(1500); // Simulate optimization time
  
  const run = mockRuns.find(r => r.id === id);
  if (!run) return null;
  
  // Generate optimized routes
  run.vans = generateVanRoutes();
  run.status = 'routed';
  run.lastOptimizedAt = new Date().toISOString();
  
  const totalStops = run.vans.reduce((sum, v) => sum + v.stats.stops, 0);
  run.totals.dropsCount = totalStops;
  run.totals.unassignedCount = Math.max(0, run.totals.ordersCount - totalStops);
  run.totals.estimatedDistanceKm = Math.round(run.vans.reduce((sum, v) => sum + v.stats.distanceKm, 0) * 10) / 10;
  run.totals.estimatedDurationMin = run.vans.reduce((sum, v) => sum + v.stats.durationMin, 0);
  
  // Keep a few unassigned with issues
  if (run.totals.unassignedCount > 0) {
    run.unassignedOrders = run.unassignedOrders.slice(0, run.totals.unassignedCount);
    run.issues = run.unassignedOrders.map(o => ({
      type: ['MISSING_GEO', 'BAD_ADDRESS', 'OUT_OF_RANGE'][Math.floor(Math.random() * 3)] as any,
      message: 'Could not assign to any route',
      orderId: o.orderId
    }));
  } else {
    run.unassignedOrders = [];
    run.issues = [];
  }
  
  return run;
};

export const mockDispatchRun = async (id: string): Promise<DeliveryRun | null> => {
  await delay(400);
  
  const run = mockRuns.find(r => r.id === id);
  if (!run) return null;
  
  run.status = 'dispatched';
  return run;
};

export const mockUnlockRun = async (id: string): Promise<DeliveryRun | null> => {
  await delay(300);
  
  const run = mockRuns.find(r => r.id === id);
  if (!run) return null;
  
  run.status = 'draft';
  run.lockedAt = undefined;
  
  return run;
};
