const DeliveryBatch = require("../models/deliveryBatch.model");
const Route = require("../models/route.model");
const Stop = require("../models/stop.model");
const Order = require("../models/order.model");
const User = require("../models/user.model");
const Role = require("../models/role.model");

const { optimizeRoutes } = require("./googleRoute.service");

const WAREHOUSE_LAT = Number(process.env.WAREHOUSE_LAT);
const WAREHOUSE_LNG = Number(process.env.WAREHOUSE_LNG);

const DEFAULT_TRAVEL_SECONDS = Number(process.env.FORCED_TRAVEL_SECONDS ?? 600);

const DELIVERY_TIME_ZONE =
  process.env.DELIVERY_TIME_ZONE ||
  process.env.BUSINESS_TIME_ZONE ||
  "Europe/London";

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

function isHHMM(value) {
  if (typeof value !== "string") return false;
  if (!/^\d{2}:\d{2}$/.test(value)) return false;
  const [hh, mm] = value.split(":").map((x) => Number(x));
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return false;
  if (hh < 0 || hh > 23) return false;
  if (mm < 0 || mm > 59) return false;
  return true;
}

function parseDurationSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    // Cloud Fleet Routing commonly returns durations like "123s".
    if (trimmed.endsWith("s")) {
      const n = Number.parseFloat(trimmed.slice(0, -1));
      return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
    }
    const n = Number.parseFloat(trimmed);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
  }
  return 0;
}

function getTimeZoneOffsetMs(date, timeZone) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = dtf.formatToParts(date);
  const map = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  let hour = Number(map.hour);
  if (hour === 24) hour = 0;

  const asUTC = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    hour,
    Number(map.minute),
    Number(map.second),
  );

  return asUTC - date.getTime();
}

function toUtcIsoOnBatchDate(batchDeliveryDate, hhmm, timeZone) {
  if (!isHHMM(hhmm)) return null;
  const base = new Date(batchDeliveryDate);
  if (Number.isNaN(base.getTime())) return null;

  const [hh, mm] = hhmm.split(":").map((x) => Number(x));

  // Anchor the *calendar day* using the stored UTC deliveryDate.
  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const day = base.getUTCDate();

  const utcGuess = new Date(Date.UTC(year, month, day, hh, mm, 0, 0));

  // Refine for DST using iterative offset correction.
  let corrected = utcGuess;
  for (let i = 0; i < 3; i++) {
    const offset = getTimeZoneOffsetMs(corrected, timeZone);
    const next = new Date(utcGuess.getTime() - offset);
    if (next.getTime() === corrected.getTime()) break;
    corrected = next;
  }

  return corrected.toISOString();
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

  const coerceToISO = (value) => {
    if (typeof value !== "string" || !value.trim()) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };

  const startISO = startCandidate
    ? isHHMM(startCandidate)
      ? toUtcIsoOnBatchDate(
          batch.deliveryDate,
          startCandidate,
          DELIVERY_TIME_ZONE,
        )
      : coerceToISO(startCandidate)
    : null;

  const globalStartTime = startISO || fallbackStartISO;
  const start = new Date(globalStartTime);

  const endISO = endCandidate
    ? isHHMM(endCandidate)
      ? toUtcIsoOnBatchDate(
          batch.deliveryDate,
          endCandidate,
          DELIVERY_TIME_ZONE,
        )
      : coerceToISO(endCandidate)
    : null;

  let end;
  if (endISO) {
    end = new Date(endISO);
  } else {
    end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  }

  if (Number.isNaN(end.getTime()) || end <= start) {
    end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  }

  return {
    globalStartTime: start.toISOString(),
    globalEndTime: end.toISOString(),
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
  // Group Orders
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

  // Equal distribution enforcement
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
  // Create Routes
  // -------------------------
  for (const routeData of optimized.routes || []) {
    const initialDurationSeconds = parseDurationSeconds(
      routeData.metrics?.totalDuration ?? routeData.metrics?.travelDuration,
    );

    const route = await Route.create({
      batch: batch._id,
      driver: routeData.vehicleLabel,
      totalStops: 0,
      totalDistanceMeters: routeData.metrics?.travelDistanceMeters || 0,
      totalDurationSeconds: initialDurationSeconds,
      polyline: extractEncodedPolyline(routeData),
    });

    let sequence = 1;

    for (const visit of routeData.visits || []) {
      if (visit.shipmentIndex === undefined) continue;

      const idx = Number(visit.shipmentIndex);
      assignedIndexes.add(idx);
      const group = groupedOrders[idx];

      const serviceSeconds = computeServiceSeconds(group.orders.length);
      const arrival = visit.startTime ? new Date(visit.startTime) : null;
      const departure = arrival
        ? new Date(arrival.getTime() + serviceSeconds * 1000)
        : null;

      for (const order of group.orders) {
        await Stop.create({
          route: route._id,
          order: order._id,
          sequence,
          estimatedArrival: arrival,
          estimatedDeparture: departure,
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
      durationSeconds: initialDurationSeconds,
    });

    createdRouteIds.push(route._id);
  }

  // -------------------------
  // Force Equal Redistribution if Needed
  // -------------------------
  const skippedIndexes = groupedOrders
    .map((_, i) => i)
    .filter((i) => !assignedIndexes.has(i));

  if (skippedIndexes.length > 0 && createdRoutes.length > 0) {
    let routePointer = 0;

    for (const idx of skippedIndexes) {
      const routeInfo = createdRoutes[routePointer];
      const group = groupedOrders[idx];

      const lastStop = await Stop.findOne({
        route: routeInfo.routeId,
      })
        .sort({ sequence: -1 })
        .lean();

      let baseTime = lastStop?.estimatedDeparture
        ? new Date(lastStop.estimatedDeparture)
        : lastStop?.estimatedArrival
          ? new Date(lastStop.estimatedArrival)
          : new Date(globalStartTime);

      let sequence = routeInfo.stopsCount + 1;

      for (const order of group.orders) {
        const arrival = new Date(
          baseTime.getTime() + DEFAULT_TRAVEL_SECONDS * 1000,
        );
        const serviceSeconds = computeServiceSeconds(1);
        const departure = new Date(arrival.getTime() + serviceSeconds * 1000);

        await Stop.create({
          route: routeInfo.routeId,
          order: order._id,
          sequence,
          estimatedArrival: arrival,
          estimatedDeparture: departure,
          forcedAssignment: true,
        });

        baseTime = departure;
        routeInfo.durationSeconds =
          Math.max(0, Number(routeInfo.durationSeconds) || 0) +
          DEFAULT_TRAVEL_SECONDS +
          serviceSeconds;
        sequence++;
      }

      routeInfo.stopsCount += group.orders.length;
      await Route.updateOne(
        { _id: routeInfo.routeId },
        {
          $set: {
            totalStops: routeInfo.stopsCount,
            totalDurationSeconds: Math.max(
              0,
              Math.round(Number(routeInfo.durationSeconds) || 0),
            ),
          },
        },
      );
      routePointer = (routePointer + 1) % createdRoutes.length;
    }
  }

  batch.routes = createdRouteIds;
  batch.status = "routes_generated";
  batch.generatedAt = new Date();

  if (typeof startTime === "string" && isHHMM(startTime.trim())) {
    batch.deliveryWindowStart = startTime.trim();
  }
  if (typeof endTime === "string" && isHHMM(endTime.trim())) {
    batch.deliveryWindowEnd = endTime.trim();
  }
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
