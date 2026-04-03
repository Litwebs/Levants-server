const DeliveryBatch = require("../models/deliveryBatch.model");
const Route = require("../models/route.model");
const Stop = require("../models/stop.model");
const Order = require("../models/order.model");
const User = require("../models/user.model");
const Role = require("../models/role.model");

const { optimizeRoutes } = require("./googleRoute.service");

const WAREHOUSE_LAT = Number(process.env.WAREHOUSE_LAT);
const WAREHOUSE_LNG = Number(process.env.WAREHOUSE_LNG);

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

  const [hh, mm] = value.split(":").map(Number);

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

  const [hh, mm] = hhmm.split(":").map(Number);

  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const day = base.getUTCDate();

  const utcGuess = new Date(Date.UTC(year, month, day, hh, mm, 0, 0));

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

function computeServiceSeconds(orderCount) {
  const base = 120;
  const perExtraOrder = 60;
  const max = 12 * 60;

  return Math.min(max, base + Math.max(0, orderCount - 1) * perExtraOrder);
}

function groupOrdersByLocation(orders) {
  const groupedOrders = [];
  const map = new Map();

  for (const order of orders) {
    const lat = Number(order.location.lat);
    const lng = Number(order.location.lng);
    const key = `${lat.toFixed(5)}|${lng.toFixed(5)}`;

    if (!map.has(key)) {
      const group = {
        lat,
        lng,
        orders: [],
      };
      map.set(key, group);
      groupedOrders.push(group);
    }

    map.get(key).orders.push(order);
  }

  return groupedOrders;
}

function splitGroupedOrdersEvenly(groupedOrders, drivers) {
  const buckets = drivers.map((driver) => ({
    driver,
    groups: [],
    totalOrders: 0,
  }));

  if (!drivers.length) return buckets;

  const sortedGroups = [...groupedOrders].sort(
    (a, b) => b.orders.length - a.orders.length,
  );

  for (const group of sortedGroups) {
    buckets.sort((a, b) => a.totalOrders - b.totalOrders);
    buckets[0].groups.push(group);
    buckets[0].totalOrders += group.orders.length;
  }

  return buckets;
}

function buildShipmentsFromGroups(groups) {
  return groups.map((group, index) => ({
    label: `shipment-${index}`,
    deliveries: [
      {
        arrivalLocation: {
          latitude: group.lat,
          longitude: group.lng,
        },
        duration: `${computeServiceSeconds(group.orders.length)}s`,
      },
    ],
  }));
}

function buildShipmentLookup(groups) {
  const byIndex = new Map();
  const byLabel = new Map();

  groups.forEach((group, index) => {
    byIndex.set(index, group);
    byLabel.set(`shipment-${index}`, { index, group });
  });

  return { byIndex, byLabel };
}

function resolveVisitShipment(visit, shipmentLookup) {
  if (
    visit?.shipmentIndex !== undefined &&
    visit?.shipmentIndex !== null &&
    Number.isInteger(Number(visit.shipmentIndex)) &&
    shipmentLookup.byIndex.has(Number(visit.shipmentIndex))
  ) {
    const index = Number(visit.shipmentIndex);
    return {
      shipmentIndex: index,
      group: shipmentLookup.byIndex.get(index),
    };
  }

  if (
    typeof visit?.shipmentLabel === "string" &&
    shipmentLookup.byLabel.has(visit.shipmentLabel)
  ) {
    const resolved = shipmentLookup.byLabel.get(visit.shipmentLabel);
    return {
      shipmentIndex: resolved.index,
      group: resolved.group,
    };
  }

  return null;
}

async function optimizeSingleDriverRoute({
  driver,
  assignedGroups,
  globalStartTime,
  globalEndTime,
}) {
  if (!assignedGroups.length) {
    return {
      driver,
      assignedGroups,
      shipmentLookup: buildShipmentLookup([]),
      optimized: { routes: [] },
      routeData: null,
    };
  }

  const shipments = buildShipmentsFromGroups(assignedGroups);
  const shipmentLookup = buildShipmentLookup(assignedGroups);

  const requestBody = {
    populatePolylines: true,
    populateTransitionPolylines: true,
    allowLargeDeadlineDespiteInterruptionRisk: true,
    model: {
      globalStartTime,
      globalEndTime,
      shipments,
      vehicles: [
        {
          label: driver._id.toString(),
          startLocation: {
            latitude: WAREHOUSE_LAT,
            longitude: WAREHOUSE_LNG,
          },
          endLocation: {
            latitude: WAREHOUSE_LAT,
            longitude: WAREHOUSE_LNG,
          },
          costPerHour: 1,
          costPerKilometer: 0.001,
        },
      ],
    },
  };

  const optimized = await optimizeRoutes(requestBody);

  // console.log(
  //   `===== GOOGLE OPTIMIZATION RESPONSE FOR DRIVER ${driver._id} =====`,
  // );
  // console.dir(optimized, { depth: null });
  // console.log(
  //   `===== END GOOGLE OPTIMIZATION RESPONSE FOR DRIVER ${driver._id} =====`,
  // );

  return {
    driver,
    assignedGroups,
    shipmentLookup,
    optimized,
    routeData:
      Array.isArray(optimized?.routes) && optimized.routes.length > 0
        ? optimized.routes[0]
        : null,
  };
}

async function generateRoutesForBatch({
  batchId,
  driverIds,
  startTime,
  endTime,
} = {}) {
  const batch = await DeliveryBatch.findById(batchId);
  if (!batch) {
    return { success: false, message: "Batch not found" };
  }

  if (!isValidLatLng(WAREHOUSE_LAT, WAREHOUSE_LNG)) {
    return { success: false, message: "Invalid warehouse coordinates" };
  }

  const existingRoutes = await Route.find({ batch: batch._id })
    .select("_id")
    .lean();

  const existingRouteIds = existingRoutes.map((r) => r._id);

  const orders = await Order.find({ _id: { $in: batch.orders } }).lean();

  if (!orders.length) {
    return { success: false, message: "No orders found for this batch" };
  }

  const invalidGeoOrders = orders.filter(
    (o) => !isValidLatLng(Number(o?.location?.lat), Number(o?.location?.lng)),
  );

  if (invalidGeoOrders.length > 0) {
    return {
      success: false,
      message: `Invalid coordinates for ${invalidGeoOrders.length} orders`,
      invalidOrderIds: invalidGeoOrders.map((o) => String(o._id)),
    };
  }

  const driverRole = await Role.findOne({ name: "driver" }).lean();

  const driverFilter = {
    status: "active",
  };

  if (driverRole?._id) {
    driverFilter.role = driverRole._id;
  }

  if (Array.isArray(driverIds) && driverIds.length > 0) {
    driverFilter._id = { $in: driverIds };
  }

  const drivers = await User.find(driverFilter).lean();

  if (!drivers.length) {
    return { success: false, message: "No active drivers found" };
  }

  const groupedOrders = groupOrdersByLocation(orders);

  if (groupedOrders.length < drivers.length) {
    return {
      success: false,
      message: `Not enough grouped stops (${groupedOrders.length}) for ${drivers.length} drivers`,
    };
  }

  const { globalStartTime, globalEndTime } = resolveOptimizationWindow({
    batch,
    startTime,
    endTime,
  });

  const driverBuckets = splitGroupedOrdersEvenly(groupedOrders, drivers);

  if (existingRouteIds.length > 0) {
    await Stop.deleteMany({ route: { $in: existingRouteIds } });
    await Route.deleteMany({ _id: { $in: existingRouteIds } });
  }

  const optimizationResults = [];

  for (const bucket of driverBuckets) {
    try {
      const result = await optimizeSingleDriverRoute({
        driver: bucket.driver,
        assignedGroups: bucket.groups,
        globalStartTime,
        globalEndTime,
      });

      if (result.optimized?.validationErrors?.length) {
        return {
          success: false,
          message: `Optimization request has validation errors for driver ${bucket.driver._id}`,
          validationErrors: result.optimized.validationErrors,
        };
      }

      optimizationResults.push(result);
    } catch (e) {
      console.error(
        `===== GOOGLE OPTIMIZATION ERROR FOR DRIVER ${bucket.driver._id} =====`,
      );
      console.error(
        JSON.stringify(
          {
            message: e.message,
            status: e.response?.status,
            data: e.response?.data,
          },
          null,
          2,
        ),
      );
      console.error(
        `===== END GOOGLE OPTIMIZATION ERROR FOR DRIVER ${bucket.driver._id} =====`,
      );

      return {
        success: false,
        message: `Optimization failed for driver ${bucket.driver._id}`,
        error: e.response?.data || e.message,
      };
    }
  }

  const createdRouteIds = [];
  const assignedOrderIds = new Set();
  let totalAssignedGroups = 0;

  for (const result of optimizationResults) {
    const { driver, routeData, shipmentLookup, assignedGroups, optimized } =
      result;

    if (!assignedGroups.length) {
      continue;
    }

    if (!routeData) {
      return {
        success: false,
        message: `No optimized route returned for driver ${driver._id}`,
        debug: {
          optimized,
          assignedGroupsCount: assignedGroups.length,
        },
      };
    }

    const initialDurationSeconds = parseDurationSeconds(
      routeData.metrics?.totalDuration ?? routeData.metrics?.travelDuration,
    );

    const totalDistanceMeters = Math.round(
      Number(routeData.metrics?.travelDistanceMeters || 0),
    );

    const route = await Route.create({
      batch: batch._id,
      driver: driver._id,
      totalStops: 0,
      totalDistanceMeters,
      totalDurationSeconds: initialDurationSeconds,
      polyline: extractEncodedPolyline(routeData),
    });

    let sequence = 1;
    let groupsAssignedToThisDriver = 0;

    for (const visit of routeData.visits || []) {
      const resolvedVisit = resolveVisitShipment(visit, shipmentLookup);

      if (!resolvedVisit) {
        console.warn(
          `Could not resolve shipment for driver ${driver._id}: ${JSON.stringify(
            visit,
          )}`,
        );
        continue;
      }

      const { group } = resolvedVisit;
      groupsAssignedToThisDriver += 1;
      totalAssignedGroups += 1;

      const serviceSeconds = computeServiceSeconds(group.orders.length);
      const arrival = visit.startTime ? new Date(visit.startTime) : null;
      const departure = arrival
        ? new Date(arrival.getTime() + serviceSeconds * 1000)
        : null;

      for (const order of group.orders) {
        assignedOrderIds.add(String(order._id));

        await Stop.create({
          route: route._id,
          order: order._id,
          sequence,
          estimatedArrival: arrival,
          estimatedDeparture: departure,
        });

        sequence += 1;
      }
    }

    await Route.updateOne(
      { _id: route._id },
      {
        $set: {
          totalStops: sequence - 1,
        },
      },
    );

    if (groupsAssignedToThisDriver === 0) {
      await Stop.deleteMany({ route: route._id });
      await Route.deleteOne({ _id: route._id });

      return {
        success: false,
        message: `Driver ${driver._id} was assigned grouped stops before optimization but ended up with no visits`,
        debug: {
          assignedGroupsCount: assignedGroups.length,
          optimized,
        },
      };
    }

    createdRouteIds.push(route._id);
  }

  const unassignedOrders = orders.filter(
    (order) => !assignedOrderIds.has(String(order._id)),
  );

  if (unassignedOrders.length > 0) {
    return {
      success: false,
      message: `${unassignedOrders.length} orders were not assigned to any route`,
      unassignedOrderIds: unassignedOrders.map((o) => String(o._id)),
    };
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
      driversUsed: optimizationResults.length,
      ordersCount: orders.length,
      groupedStopsCount: groupedOrders.length,
      assignedGroupedStopsCount: totalAssignedGroups,
      unassignedOrdersCount: 0,
      splitSummary: driverBuckets.map((bucket) => ({
        driverId: String(bucket.driver._id),
        groupedStopsAssignedBeforeOptimization: bucket.groups.length,
        ordersAssignedBeforeOptimization: bucket.totalOrders,
      })),
    },
  };
}

module.exports = {
  generateRoutesForBatch,
};
