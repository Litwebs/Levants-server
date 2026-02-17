const DeliveryBatch = require("../models/deliveryBatch.model");
const Route = require("../models/route.model");
const Stop = require("../models/stop.model");
const Order = require("../models/order.model");
const User = require("../models/user.model");
const Role = require("../models/role.model");

const { optimizeRoutes } = require("./googleRoute.service");

const WAREHOUSE_LAT = Number(process.env.WAREHOUSE_LAT);
const WAREHOUSE_LNG = Number(process.env.WAREHOUSE_LNG);

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

  // Cloud Fleet Routing typically returns `routePolyline.points` when requested.
  const points =
    routeData.routePolyline?.points ||
    routeData.routePolyline?.encodedPolyline ||
    routeData.polyline?.points ||
    routeData.polyline?.encodedPolyline ||
    null;

  return typeof points === "string" && points.trim() ? points : null;
}

async function generateRoutesForBatch({
  batchId,
  driverIds,
  startTime,
  endTime,
} = {}) {
  const batch = await DeliveryBatch.findById(batchId);
  if (!batch) return { success: false, message: "Batch not found" };

  if (!isValidLatLng(WAREHOUSE_LAT, WAREHOUSE_LNG)) {
    return {
      success: false,
      message: "WAREHOUSE_LAT/WAREHOUSE_LNG are not configured correctly",
    };
  }

  const orders = await Order.find({
    _id: { $in: batch.orders },
  }).lean();

  const invalidGeoOrders = (orders || [])
    .filter((o) => !isValidLatLng(o?.location?.lat, o?.location?.lng))
    .map((o) => ({
      _id: o?._id?.toString?.() || String(o?._id || ""),
      orderId: o?.orderId || "",
      postcode: o?.deliveryAddress?.postcode || "",
    }));

  if (invalidGeoOrders.length > 0) {
    return {
      success: false,
      message: `Cannot generate routes: ${invalidGeoOrders.length} order(s) missing valid coordinates`,
      data: { invalidGeoOrders },
    };
  }

  const driverRole = await Role.findOne({ name: "driver" });
  const filter = {
    role: driverRole?._id,
    status: "active",
  };

  if (Array.isArray(driverIds) && driverIds.length > 0) {
    filter._id = { $in: driverIds };
  }

  const drivers = await User.find(filter).lean();

  if (!drivers.length)
    return { success: false, message: "No active drivers found" };

  // Force the optimizer to spread deliveries across the selected drivers.
  // We model each order as weight=1 and cap each vehicle to roughly N/drivers.
  const maxOrdersPerDriver = Math.max(
    1,
    Math.ceil((orders?.length || 0) / drivers.length),
  );

  // Group orders that share the same delivery location into a single optimizer
  // "visit" so they share the same ETA (while still creating one Stop per order).
  const locationKeyForOrder = (order) => {
    const lat = Number(order?.location?.lat);
    const lng = Number(order?.location?.lng);
    const latKey = Number.isFinite(lat) ? lat.toFixed(5) : "";
    const lngKey = Number.isFinite(lng) ? lng.toFixed(5) : "";
    const postcode = String(order?.deliveryAddress?.postcode || "")
      .trim()
      .toUpperCase();
    const line1 = String(order?.deliveryAddress?.line1 || "")
      .trim()
      .toUpperCase();
    return `${latKey}|${lngKey}|${postcode}|${line1}`;
  };

  const groupedOrders = [];
  const groupMap = new Map();

  for (const order of orders) {
    const key = locationKeyForOrder(order);
    const existing = groupMap.get(key);
    if (existing) {
      existing.orders.push(order);
    } else {
      const group = {
        key,
        lat: order.location.lat,
        lng: order.location.lng,
        orders: [order],
      };
      groupMap.set(key, group);
      groupedOrders.push(group);
    }
  }

  const shipments = groupedOrders.map((group) => {
    const count = Array.isArray(group.orders) ? group.orders.length : 1;
    const serviceSeconds = Math.max(60, 300 * count);
    return {
      deliveries: [
        {
          arrivalLocation: {
            latitude: group.lat,
            longitude: group.lng,
          },
          duration: `${serviceSeconds}s`,
        },
      ],
      loadDemands: {
        weight: { amount: count },
      },
    };
  });

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

  const hhmm = /^\d{2}:\d{2}$/;
  const cleanStart =
    typeof startTime === "string" && startTime.trim()
      ? startTime.trim()
      : undefined;
  const cleanEnd =
    typeof endTime === "string" && endTime.trim() ? endTime.trim() : undefined;

  if (cleanStart && !hhmm.test(cleanStart)) {
    return { success: false, message: "startTime must be in HH:mm format" };
  }
  if (cleanEnd && !hhmm.test(cleanEnd)) {
    return { success: false, message: "endTime must be in HH:mm format" };
  }

  const toUtcIsoOnBatchDate = (time) => {
    const [hh, mm] = String(time)
      .split(":")
      .map((x) => Number(x));
    const d = new Date(batch.deliveryDate);
    return new Date(
      Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate(),
        hh,
        mm,
        0,
        0,
      ),
    ).toISOString();
  };

  const effectiveStart =
    cleanStart ||
    (typeof batch.deliveryWindowStart === "string" &&
    batch.deliveryWindowStart.trim()
      ? batch.deliveryWindowStart.trim()
      : undefined);
  const effectiveEnd =
    cleanEnd ||
    (typeof batch.deliveryWindowEnd === "string" &&
    batch.deliveryWindowEnd.trim()
      ? batch.deliveryWindowEnd.trim()
      : undefined);

  if (effectiveStart && !hhmm.test(effectiveStart)) {
    return { success: false, message: "Stored deliveryWindowStart is invalid" };
  }
  if (effectiveEnd && !hhmm.test(effectiveEnd)) {
    return { success: false, message: "Stored deliveryWindowEnd is invalid" };
  }

  const globalStartTime = effectiveStart
    ? toUtcIsoOnBatchDate(effectiveStart)
    : new Date(batch.deliveryDate).toISOString();

  const globalEndTime = effectiveEnd
    ? toUtcIsoOnBatchDate(effectiveEnd)
    : new Date(
        new Date(batch.deliveryDate).getTime() + 10 * 60 * 60 * 1000,
      ).toISOString();

  if (effectiveStart && effectiveEnd) {
    const s = new Date(globalStartTime).getTime();
    const e = new Date(globalEndTime).getTime();
    if (Number.isFinite(s) && Number.isFinite(e) && e <= s) {
      return { success: false, message: "endTime must be after startTime" };
    }
  }

  const requestBody = {
    // Ask the API to populate route polylines in the response.
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
  } catch (err) {
    return {
      success: false,
      message: "Google optimization failed",
      error: err.response?.data || err.message,
    };
  }

  const createdRouteIds = [];
  const createdRoutes = [];

  // Track shipments not covered by the optimizer so we can fallback-assign them
  // (business requirement: never leave orders unassigned).
  const assignedShipmentIndices = new Set();
  for (const r of optimized?.routes || []) {
    for (const v of r?.visits || []) {
      if (v && v.shipmentIndex !== undefined && v.shipmentIndex !== null) {
        assignedShipmentIndices.add(Number(v.shipmentIndex));
      }
    }
  }

  const missingShipmentIndices = [];
  for (let i = 0; i < (groupedOrders?.length || 0); i++) {
    if (!assignedShipmentIndices.has(i)) missingShipmentIndices.push(i);
  }

  // We'll create fallback route(s) later if needed.

  for (const routeData of optimized?.routes || []) {
    const visitCount = Array.isArray(routeData.visits)
      ? routeData.visits
          .filter((v) => v && v.shipmentIndex !== undefined)
          .reduce((sum, v) => {
            const idx = Number(v.shipmentIndex);
            const group = groupedOrders[idx];
            const n = Array.isArray(group?.orders) ? group.orders.length : 0;
            return sum + n;
          }, 0)
      : 0;

    // Don't create empty placeholder routes in Mongo.
    if (visitCount === 0) continue;

    const polyline = extractEncodedPolyline(routeData);

    const route = await Route.create({
      batch: batch._id,
      driver: routeData.vehicleLabel,
      totalStops: visitCount,
      totalDistanceMeters: routeData.metrics?.travelDistanceMeters || 0,
      totalDurationSeconds: parseDuration(routeData.metrics?.travelDuration),
      polyline,
    });

    let sequence = 1;

    for (const visit of routeData.visits || []) {
      if (visit.shipmentIndex === undefined) continue;

      const group = groupedOrders[Number(visit.shipmentIndex)];
      const groupOrders = Array.isArray(group?.orders) ? group.orders : [];

      for (const order of groupOrders) {
        await Stop.create({
          route: route._id,
          order: order._id,
          sequence,
          estimatedArrival: visit.startTime ? new Date(visit.startTime) : null,
        });
        sequence++;
      }
    }

    createdRouteIds.push(route._id);
    createdRoutes.push({
      routeId: route._id,
      driverId: routeData.vehicleLabel,
      stopsCount: visitCount,
    });
  }

  let fallback = null;

  if (missingShipmentIndices.length > 0) {
    // Never create a second route for the same driver.
    // Prefer appending skipped orders onto the existing created routes, spreading
    // across routes by lowest current stop count.
    if (createdRoutes.length === 0) {
      const driverId = drivers[0]?._id?.toString?.();
      if (driverId) {
        const route = await Route.create({
          batch: batch._id,
          driver: driverId,
          totalStops: missingShipmentIndices.reduce((sum, idx) => {
            const group = groupedOrders[idx];
            return (
              sum + (Array.isArray(group?.orders) ? group.orders.length : 0)
            );
          }, 0),
          totalDistanceMeters: 0,
          totalDurationSeconds: 0,
          polyline: null,
        });

        let sequence = 1;
        for (const idx of missingShipmentIndices) {
          const group = groupedOrders[idx];
          const groupOrders = Array.isArray(group?.orders) ? group.orders : [];
          for (const order of groupOrders) {
            if (!order?._id) continue;
            await Stop.create({
              route: route._id,
              order: order._id,
              sequence,
              estimatedArrival: null,
            });
            sequence++;
          }
        }

        createdRouteIds.push(route._id);
        createdRoutes.push({
          routeId: route._id,
          driverId,
          stopsCount: sequence - 1,
        });

        fallback = {
          mode: "created",
          routeId: route._id,
          driverId,
          ordersAssigned: missingShipmentIndices.length,
          skippedShipments: optimized?.skippedShipments || undefined,
        };
      }
    } else {
      const affected = new Map();

      const pickRouteIndex = () => {
        let minIdx = 0;
        let minStops = createdRoutes[0].stopsCount;
        for (let i = 1; i < createdRoutes.length; i++) {
          if (createdRoutes[i].stopsCount < minStops) {
            minStops = createdRoutes[i].stopsCount;
            minIdx = i;
          }
        }
        return minIdx;
      };

      for (const idx of missingShipmentIndices) {
        const group = groupedOrders[idx];
        const groupOrders = Array.isArray(group?.orders) ? group.orders : [];
        if (groupOrders.length === 0) continue;

        const routeIdx = pickRouteIndex();
        const routeInfo = createdRoutes[routeIdx];
        routeInfo.stopsCount += groupOrders.length;
        affected.set(String(routeInfo.routeId), routeInfo.stopsCount);

        for (let i = 0; i < groupOrders.length; i++) {
          const order = groupOrders[i];
          if (!order?._id) continue;
          await Stop.create({
            route: routeInfo.routeId,
            order: order._id,
            sequence: routeInfo.stopsCount - (groupOrders.length - 1) + i,
            estimatedArrival: null,
          });
        }
      }

      for (const r of createdRoutes) {
        if (affected.has(String(r.routeId))) {
          await Route.updateOne(
            { _id: r.routeId },
            { $set: { totalStops: r.stopsCount } },
          );
        }
      }

      fallback = {
        mode: "appended",
        ordersAssigned: missingShipmentIndices.length,
        skippedShipments: optimized?.skippedShipments || undefined,
      };
    }
  }

  batch.routes = createdRouteIds;
  batch.status = "routes_generated";
  batch.generatedAt = new Date();
  if (cleanStart) batch.deliveryWindowStart = cleanStart;
  if (cleanEnd) batch.deliveryWindowEnd = cleanEnd;
  await batch.save();

  return {
    success: true,
    data: {
      routesCreated: createdRouteIds.length,
      fallback,
    },
  };
}

function parseDuration(durationString) {
  if (!durationString) return 0;
  return Number(durationString.replace("s", ""));
}

module.exports = {
  generateRoutesForBatch,
};
