const DeliveryBatch = require("../models/deliveryBatch.model");
const Route = require("../models/route.model");
const Stop = require("../models/stop.model");
const Order = require("../models/order.model");
const User = require("../models/user.model");
const Role = require("../models/role.model");

const { optimizeRoutes } = require("./googleRoute.service");

const WAREHOUSE_LAT = Number(process.env.WAREHOUSE_LAT);
const WAREHOUSE_LNG = Number(process.env.WAREHOUSE_LNG);

const DEFAULT_TRAVEL_SECONDS = Number(process.env.FORCED_TRAVEL_SECONDS ?? 600); // 10 min fallback travel

function isFiniteNumber(n) {
  return typeof n === "number" && Number.isFinite(n);
}

function isValidLatLng(lat, lng) {
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

function extractEncodedPolyline(routeData) {
  if (!routeData || typeof routeData !== "object") return null;

  const points =
    routeData.routePolyline?.points || routeData.polyline?.points || null;

  return typeof points === "string" && points.trim() ? points : null;
}

function parseDuration(durationString) {
  if (!durationString) return 0;
  return Number(durationString.replace("s", ""));
}

function isHHMM(value) {
  if (typeof value !== "string") return false;
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hh, mm] = value.split(":").map((x) => Number(x));
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return false;
  if (hh < 0 || hh > 23) return false;
  if (mm < 0 || mm > 59) return false;
  return true;
}

function toISODateTimeOnBatchDayUTC(batchDeliveryDate, hhmm) {
  const base = new Date(batchDeliveryDate);
  if (Number.isNaN(base.getTime())) return null;
  if (!isHHMM(hhmm)) return null;

  const [hh, mm] = hhmm.split(":").map((x) => Number(x));
  const dt = new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate(),
      hh,
      mm,
      0,
      0,
    ),
  );
  return dt.toISOString();
}

function coerceToISO(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function resolveOptimizationWindow({ batch, startTime, endTime }) {
  const startCandidate =
    typeof startTime === "string" && startTime.trim()
      ? startTime.trim()
      : typeof batch?.deliveryWindowStart === "string" &&
          batch.deliveryWindowStart.trim()
        ? batch.deliveryWindowStart.trim()
        : undefined;

  const endCandidate =
    typeof endTime === "string" && endTime.trim()
      ? endTime.trim()
      : typeof batch?.deliveryWindowEnd === "string" &&
          batch.deliveryWindowEnd.trim()
        ? batch.deliveryWindowEnd.trim()
        : undefined;

  const fallbackStartISO = new Date(batch.deliveryDate).toISOString();

  const startISO = isHHMM(startCandidate)
    ? toISODateTimeOnBatchDayUTC(batch.deliveryDate, startCandidate)
    : coerceToISO(startCandidate);

  const effectiveStartISO = startISO || fallbackStartISO;
  const effectiveStart = new Date(effectiveStartISO);

  let endISO = isHHMM(endCandidate)
    ? toISODateTimeOnBatchDayUTC(batch.deliveryDate, endCandidate)
    : coerceToISO(endCandidate);

  let effectiveEnd;
  if (endISO) {
    effectiveEnd = new Date(endISO);
  } else {
    // Keep the previous behavior: a broad horizon for optimization.
    effectiveEnd = new Date(effectiveStart.getTime() + 24 * 60 * 60 * 1000);
  }

  // If end time is earlier than start (or invalid), push it forward by 24h.
  if (Number.isNaN(effectiveEnd.getTime()) || effectiveEnd <= effectiveStart) {
    effectiveEnd = new Date(effectiveStart.getTime() + 24 * 60 * 60 * 1000);
  }

  return {
    globalStartTime: effectiveStart.toISOString(),
    globalEndTime: effectiveEnd.toISOString(),
  };
}

async function generateRoutesForBatch({
  batchId,
  driverIds,
  startTime,
  endTime,
} = {}) {
  const batch = await DeliveryBatch.findById(batchId);
  if (!batch) return { success: false, message: "Batch not found" };

  const existingRoutes = await Route.find({ batch: batch._id })
    .select("_id")
    .lean();
  const existingRouteIds = existingRoutes.map((r) => r._id);

  if (!isValidLatLng(WAREHOUSE_LAT, WAREHOUSE_LNG)) {
    return { success: false, message: "Invalid warehouse coordinates" };
  }

  const orders = await Order.find({ _id: { $in: batch.orders } }).lean();

  const invalidGeoOrders = orders.filter(
    (o) => !isValidLatLng(o?.location?.lat, o?.location?.lng),
  );

  if (invalidGeoOrders.length > 0) {
    return {
      success: false,
      message: `Invalid coordinates for ${invalidGeoOrders.length} orders`,
    };
  }

  const driverRole = await Role.findOne({ name: "driver" });
  const filter = { role: driverRole?._id, status: "active" };

  if (Array.isArray(driverIds) && driverIds.length > 0) {
    filter._id = { $in: driverIds };
  }

  const drivers = await User.find(filter).lean();
  if (!drivers.length)
    return { success: false, message: "No active drivers found" };

  // -------------------------
  // Group Orders by Location
  // -------------------------
  const groupedOrders = [];
  const map = new Map();

  for (const order of orders) {
    const lat = Number(order.location.lat);
    const lng = Number(order.location.lng);
    const key = `${lat.toFixed(5)}|${lng.toFixed(5)}`;

    if (!map.has(key)) {
      const group = { lat, lng, orders: [] };
      map.set(key, group);
      groupedOrders.push(group);
    }
    map.get(key).orders.push(order);
  }

  // -------------------------
  // Service Model
  // -------------------------
  const computeServiceSeconds = (count) => {
    const base = 120;
    const perOrder = 60;
    const max = 12 * 60;
    return Math.min(max, base + (count - 1) * perOrder);
  };

  const shipments = groupedOrders.map((group) => ({
    deliveries: [
      {
        arrivalLocation: {
          latitude: group.lat,
          longitude: group.lng,
        },
        duration: `${computeServiceSeconds(group.orders.length)}s`,
      },
    ],
    loadDemands: {
      weight: { amount: group.orders.length },
    },
  }));

  // -------------------------
  // Equal Distribution via Capacity
  // -------------------------
  const maxOrdersPerDriver = Math.ceil(orders.length / drivers.length);

  const vehicles = drivers.map((driver) => ({
    startLocation: {
      latitude: WAREHOUSE_LAT,
      longitude: WAREHOUSE_LNG,
    },
    endLocation: {
      latitude: WAREHOUSE_LAT,
      longitude: WAREHOUSE_LNG,
    },
    label: driver._id.toString(),
    loadLimits: {
      weight: { maxLoad: maxOrdersPerDriver },
    },
  }));

  const { globalStartTime, globalEndTime } = resolveOptimizationWindow({
    batch,
    startTime,
    endTime,
  });

  const requestBody = {
    populatePolylines: true,
    populateTransitionPolylines: true,
    model: {
      globalStartTime,
      globalEndTime,
      shipments,
      vehicles,
    },
  };

  let optimized;
  try {
    optimized = await optimizeRoutes(requestBody);
  } catch {
    return { success: false, message: "Optimization failed" };
  }

  if (!optimized) {
    return { success: false, message: "Optimization failed" };
  }

  if (existingRouteIds.length > 0) {
    await Stop.deleteMany({ route: { $in: existingRouteIds } });
    await Route.deleteMany({ _id: { $in: existingRouteIds } });
  }

  const createdRoutes = [];
  const createdRouteIds = [];
  const assignedIndexes = new Set();

  // -------------------------
  // Create Optimized Routes
  // -------------------------
  for (const routeData of optimized.routes || []) {
    const route = await Route.create({
      batch: batch._id,
      driver: routeData.vehicleLabel,
      totalStops: 0,
      totalDistanceMeters: routeData.metrics?.travelDistanceMeters || 0,
      totalDurationSeconds: parseDuration(routeData.metrics?.travelDuration),
      polyline: extractEncodedPolyline(routeData),
    });

    let sequence = 1;

    for (const visit of routeData.visits || []) {
      if (visit.shipmentIndex === undefined) continue;

      const idx = Number(visit.shipmentIndex);
      assignedIndexes.add(idx);

      const group = groupedOrders[idx];

      for (const order of group.orders) {
        await Stop.create({
          route: route._id,
          order: order._id,
          sequence,
          estimatedArrival: visit.startTime ? new Date(visit.startTime) : null,
        });
        sequence++;
      }
    }

    await Route.updateOne(
      { _id: route._id },
      { $set: { totalStops: sequence - 1 } },
    );

    createdRoutes.push({
      routeId: route._id,
      stopsCount: sequence - 1,
    });

    createdRouteIds.push(route._id);
  }

  // -------------------------
  // Equal Redistribution (ETA from Start Time)
  // -------------------------
  const skippedIndexes = groupedOrders
    .map((_, i) => i)
    .filter((i) => !assignedIndexes.has(i));

  if (skippedIndexes.length > 0 && createdRoutes.length > 0) {
    let routePointer = 0;

    for (const idx of skippedIndexes) {
      const routeInfo = createdRoutes[routePointer];
      const group = groupedOrders[idx];

      const lastStop = await Stop.findOne({ route: routeInfo.routeId })
        .sort({ sequence: -1 })
        .lean();

      let baseTime = lastStop?.estimatedArrival
        ? new Date(lastStop.estimatedArrival)
        : new Date(globalStartTime);

      let sequence = routeInfo.stopsCount + 1;

      for (const order of group.orders) {
        baseTime = new Date(baseTime.getTime() + DEFAULT_TRAVEL_SECONDS * 1000);

        const serviceSeconds = computeServiceSeconds(1);

        const eta = new Date(baseTime.getTime() + serviceSeconds * 1000);

        await Stop.create({
          route: routeInfo.routeId,
          order: order._id,
          sequence,
          estimatedArrival: eta,
          forcedAssignment: true,
        });

        baseTime = eta;
        sequence++;
      }

      routeInfo.stopsCount += group.orders.length;

      await Route.updateOne(
        { _id: routeInfo.routeId },
        { $set: { totalStops: routeInfo.stopsCount } },
      );

      routePointer = (routePointer + 1) % createdRoutes.length;
    }
  }

  batch.routes = createdRouteIds;
  batch.status = "routes_generated";
  batch.generatedAt = new Date();
  await batch.save();

  return {
    success: true,
    data: {
      routesCreated: createdRouteIds.length,
      forcedAssignments: skippedIndexes.length,
    },
  };
}

module.exports = {
  generateRoutesForBatch,
};
