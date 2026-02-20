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

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (deg) => (Number(deg) * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function generateRoutesForBatch({
  batchId,
  driverIds,
  startTime,
  endTime,
} = {}) {
  const batch = await DeliveryBatch.findById(batchId);
  if (!batch) return { success: false, message: "Batch not found" };

  // If we're regenerating, we will replace existing routes/stops.
  // Defer deletion until we've confirmed optimization succeeded so we don't
  // accidentally wipe a usable previous plan.
  const existingRoutes = await Route.find({ batch: batch._id })
    .select("_id")
    .lean();
  const existingRouteIds = existingRoutes.map((r) => r._id);

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

  // Service time is a modelling parameter that heavily impacts feasibility.
  // The previous behaviour (5 minutes per order) can easily make the optimizer
  // skip shipments inside realistic windows, especially for grouped addresses.
  // Default: 2 min base + 1 min per additional order, capped at 12 min.
  const STOP_SERVICE_MIN_SECONDS = Math.max(
    0,
    Number(process.env.STOP_SERVICE_MIN_SECONDS ?? 60) || 60,
  );
  const STOP_SERVICE_BASE_SECONDS = Math.max(
    0,
    Number(process.env.STOP_SERVICE_BASE_SECONDS ?? 120) || 120,
  );
  const STOP_SERVICE_PER_ORDER_SECONDS = Math.max(
    0,
    Number(process.env.STOP_SERVICE_PER_ORDER_SECONDS ?? 60) || 60,
  );
  const STOP_SERVICE_MAX_SECONDS = Math.max(
    STOP_SERVICE_MIN_SECONDS,
    Number(process.env.STOP_SERVICE_MAX_SECONDS ?? 12 * 60) || 12 * 60,
  );

  const computeServiceSeconds = (orderCount) => {
    const c = Math.max(1, Number(orderCount) || 1);
    const seconds =
      STOP_SERVICE_BASE_SECONDS +
      Math.max(0, c - 1) * STOP_SERVICE_PER_ORDER_SECONDS;
    const clamped = Math.min(
      STOP_SERVICE_MAX_SECONDS,
      Math.max(STOP_SERVICE_MIN_SECONDS, seconds),
    );
    return Math.round(clamped);
  };

  let shipments = groupedOrders.map((group) => {
    const count = Array.isArray(group.orders) ? group.orders.length : 1;
    const serviceSeconds = computeServiceSeconds(count);
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

  if (
    process.env.DEBUG_ROUTE_OPTIMIZER === "1" &&
    process.env.NODE_ENV !== "production"
  ) {
    const serviceSecondsList = groupedOrders.map((g) =>
      computeServiceSeconds(Array.isArray(g.orders) ? g.orders.length : 1),
    );
    const sumServiceSeconds = serviceSecondsList.reduce(
      (s, x) => s + (Number(x) || 0),
      0,
    );
    const maxServiceSeconds = serviceSecondsList.reduce(
      (m, x) => Math.max(m, Number(x) || 0),
      0,
    );
    const groupedOrderCounts = groupedOrders.map((g) =>
      Array.isArray(g.orders) ? g.orders.length : 1,
    );
    const maxGroupCount = groupedOrderCounts.reduce(
      (m, x) => Math.max(m, Number(x) || 0),
      0,
    );
    // eslint-disable-next-line no-console
    console.log("[route.optimize] shipments", {
      batchId: String(batch?._id || ""),
      orders: orders?.length || 0,
      groupedStops: groupedOrders.length,
      maxGroupedOrdersAtOneStop: maxGroupCount,
      serviceSeconds: {
        min: STOP_SERVICE_MIN_SECONDS,
        base: STOP_SERVICE_BASE_SECONDS,
        perOrder: STOP_SERVICE_PER_ORDER_SECONDS,
        max: STOP_SERVICE_MAX_SECONDS,
        sum: sumServiceSeconds,
        maxStop: maxServiceSeconds,
      },
    });
  }

  const maxGroupedLoad = groupedOrders.reduce((max, group) => {
    const count = Array.isArray(group?.orders) ? group.orders.length : 1;
    return Math.max(max, Number(count) || 0);
  }, 0);
  const vehicleMaxLoad = Math.max(maxOrdersPerDriver, maxGroupedLoad || 0);

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
      // Ensure the biggest grouped shipment can fit on any vehicle.
      // If maxLoad is too small, the optimizer will skip shipments, which
      // results in missing (or synthetic) ETAs.
      weight: { maxLoad: vehicleMaxLoad },
    },
  }));

  const vehiclesNoLimits = drivers.map((driver) => ({
    startLocation: {
      latitude: WAREHOUSE_LAT,
      longitude: WAREHOUSE_LNG,
    },
    endLocation: {
      latitude: WAREHOUSE_LAT,
      longitude: WAREHOUSE_LNG,
    },
    label: driver._id.toString(),
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

  // Delivery batches are normalized to start-of-day UTC, but the delivery
  // window times (HH:mm) should be interpreted in the business's local time.
  // Otherwise, "18:00" is treated as 18:00Z, unintentionally shrinking the
  // available planning horizon and causing Google to skip shipments.
  const DELIVERY_TIME_ZONE =
    process.env.DELIVERY_TIME_ZONE ||
    process.env.BUSINESS_TIME_ZONE ||
    "Europe/London";

  const getTimeZoneOffsetMs = (date, timeZone) => {
    // Returns (zonedWallClockAsUTC - dateUTC) in milliseconds.
    // Example: America/Los_Angeles will typically return -28800000.
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
  };

  const toUtcIsoOnBatchDate = (time) => {
    const [hh, mm] = String(time)
      .split(":")
      .map((x) => Number(x));

    // Use the stored UTC delivery date as the calendar day anchor.
    const d = new Date(batch.deliveryDate);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    const day = d.getUTCDate();

    // First guess: interpret wall-clock time as UTC.
    const utcGuess = new Date(Date.UTC(year, month, day, hh, mm, 0, 0));

    // Refine using the target zone's offset (handles DST via iteration).
    let corrected = utcGuess;
    for (let i = 0; i < 3; i++) {
      const offset = getTimeZoneOffsetMs(corrected, DELIVERY_TIME_ZONE);
      const next = new Date(utcGuess.getTime() - offset);
      if (next.getTime() === corrected.getTime()) break;
      corrected = next;
    }

    return corrected.toISOString();
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

  const DEFAULT_OPTIMIZER_HORIZON_HOURS = Math.max(
    1,
    Number(process.env.DEFAULT_OPTIMIZER_HORIZON_HOURS ?? 10) || 10,
  );
  const DEFAULT_OPTIMIZER_HORIZON_MS =
    DEFAULT_OPTIMIZER_HORIZON_HOURS * 60 * 60 * 1000;

  // Important: if the user supplies only a startTime, the planning horizon should
  // extend from that startTime (e.g. 08:00 -> 18:00 for a 10h default), not from
  // midnight of the delivery date.
  const globalEndTime = effectiveEnd
    ? toUtcIsoOnBatchDate(effectiveEnd)
    : new Date(
        (Number.isFinite(new Date(globalStartTime).getTime())
          ? new Date(globalStartTime).getTime()
          : new Date(batch.deliveryDate).getTime()) +
          DEFAULT_OPTIMIZER_HORIZON_MS,
      ).toISOString();

  // If we require vehicles to return to the warehouse (`endLocation`), treating
  // `endTime` as a hard route end can cause otherwise-feasible deliveries to be
  // skipped (the last stop may be deliverable by endTime, but not returnable to
  // depot by endTime). Model this as:
  // - deliveries must occur within [globalStartTime, globalEndTime]
  // - vehicles may finish the route (incl. return) by globalEndTime + buffer
  const RETURN_TO_DEPOT_BUFFER_HOURS = Math.max(
    0,
    Number(process.env.RETURN_TO_DEPOT_BUFFER_HOURS ?? 2) || 2,
  );
  const returnBufferMs = RETURN_TO_DEPOT_BUFFER_HOURS * 60 * 60 * 1000;

  const deliveryWindowEndMs = new Date(globalEndTime).getTime();
  const buildOptimizationEndTime = (bufferHours) => {
    const h = Math.max(0, Number(bufferHours) || 0);
    const ms = h * 60 * 60 * 1000;
    if (effectiveEnd && Number.isFinite(deliveryWindowEndMs) && ms > 0) {
      return new Date(deliveryWindowEndMs + ms).toISOString();
    }
    return globalEndTime;
  };

  let lastReturnToDepotBufferHours = RETURN_TO_DEPOT_BUFFER_HOURS;
  let optimizationGlobalEndTime = buildOptimizationEndTime(
    lastReturnToDepotBufferHours,
  );

  // Constrain deliveries to the delivery window even if we extend the model
  // horizon to allow returning to the depot.
  if (effectiveEnd) {
    for (const sh of shipments) {
      const first = Array.isArray(sh?.deliveries) ? sh.deliveries[0] : null;
      if (!first) continue;
      first.timeWindows = [
        {
          startTime: globalStartTime,
          endTime: globalEndTime,
        },
      ];
    }
  }

  if (
    process.env.DEBUG_ROUTE_OPTIMIZER === "1" &&
    process.env.NODE_ENV !== "production"
  ) {
    // eslint-disable-next-line no-console
    console.log("[route.optimize] delivery window", {
      batchId: String(batch?._id || ""),
      deliveryDate: batch?.deliveryDate,
      tz: DELIVERY_TIME_ZONE,
      returnToDepotBufferHours: lastReturnToDepotBufferHours,
      cleanStart,
      cleanEnd,
      effectiveStart,
      effectiveEnd,
      globalStartTime,
      globalEndTime,
      optimizationGlobalEndTime,
    });
  }

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
      globalEndTime: optimizationGlobalEndTime,
      shipments,
      vehicles,
    },
  };

  const computeMissingShipmentIndices = (opt) => {
    const assigned = new Set();
    for (const r of opt?.routes || []) {
      for (const v of r?.visits || []) {
        if (v && v.shipmentIndex !== undefined && v.shipmentIndex !== null) {
          assigned.add(Number(v.shipmentIndex));
        }
      }
    }
    const missing = [];
    for (let i = 0; i < (groupedOrders?.length || 0); i++) {
      if (!assigned.has(i)) missing.push(i);
    }
    return { assigned, missing };
  };

  const runOptimize = async (body) => {
    try {
      return await optimizeRoutes(body);
    } catch (err) {
      console.error("Google optimization error:", err);
      return null;
    }
  };

  let optimized = await runOptimize(requestBody);
  if (!optimized) {
    return {
      success: false,
      message: "Google optimization failed",
    };
  }

  const tryWithOverrides = async ({
    globalEndTimeOverride,
    vehiclesOverride,
  } = {}) => {
    const body = {
      ...requestBody,
      model: {
        ...requestBody.model,
        globalEndTime: globalEndTimeOverride || requestBody.model.globalEndTime,
        vehicles: vehiclesOverride || requestBody.model.vehicles,
      },
    };
    return await runOptimize(body);
  };

  // If Google skips shipments, progressively relax the planning horizon.
  // If still skipped, retry once without load limits to avoid infeasible
  // capacity constraints created by grouped stops.
  let { missing: missingShipmentIndices } =
    computeMissingShipmentIndices(optimized);

  const hasFixedEndTime = Boolean(effectiveEnd);

  // If the user provided an endTime (or one is stored), we must respect it.
  // We only relax the end time when no explicit window end is set.
  if (!hasFixedEndTime && missingShipmentIndices.length > 0) {
    const startMs = new Date(globalStartTime).getTime();
    const baseStartMs = Number.isFinite(startMs) ? startMs : Date.now();

    const retry24h = await tryWithOverrides({
      globalEndTimeOverride: new Date(
        baseStartMs + 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
    if (retry24h) {
      optimized = retry24h;
      ({ missing: missingShipmentIndices } =
        computeMissingShipmentIndices(optimized));
    }
  }

  if (!hasFixedEndTime && missingShipmentIndices.length > 0) {
    const startMs = new Date(globalStartTime).getTime();
    const baseStartMs = Number.isFinite(startMs) ? startMs : Date.now();

    const retry48h = await tryWithOverrides({
      globalEndTimeOverride: new Date(
        baseStartMs + 48 * 60 * 60 * 1000,
      ).toISOString(),
    });
    if (retry48h) {
      optimized = retry48h;
      ({ missing: missingShipmentIndices } =
        computeMissingShipmentIndices(optimized));
    }
  }

  // Always attempt a no-load-limits retry (within the same horizon) in case
  // capacity constraints from grouping cause infeasibility.
  if (missingShipmentIndices.length > 0) {
    const retryNoLimits = await tryWithOverrides({
      vehiclesOverride: vehiclesNoLimits,
    });
    if (retryNoLimits) {
      optimized = retryNoLimits;
      ({ missing: missingShipmentIndices } =
        computeMissingShipmentIndices(optimized));
    }
  }

  // If we have a fixed delivery endTime, deliveries are already constrained via
  // shipment timeWindows. The remaining infeasibility is often the depot return.
  // Retry with progressively larger return buffers without changing the delivery window.
  if (
    hasFixedEndTime &&
    missingShipmentIndices.length > 0 &&
    Number.isFinite(deliveryWindowEndMs)
  ) {
    const bufferCandidates = [4, 8, 12];
    for (const bufferHours of bufferCandidates) {
      if (bufferHours <= lastReturnToDepotBufferHours) continue;
      const overrideEnd = buildOptimizationEndTime(bufferHours);
      if (!overrideEnd || overrideEnd === requestBody.model.globalEndTime)
        continue;

      const retryMoreReturnTime = await tryWithOverrides({
        globalEndTimeOverride: overrideEnd,
      });
      if (retryMoreReturnTime) {
        optimized = retryMoreReturnTime;
        lastReturnToDepotBufferHours = bufferHours;
        optimizationGlobalEndTime = overrideEnd;
        ({ missing: missingShipmentIndices } =
          computeMissingShipmentIndices(optimized));
      }

      if (missingShipmentIndices.length === 0) break;
    }
  }

  // If shipments are still skipped after retry, we cannot produce accurate ETAs
  // for all stops. Prefer leaving skipped orders unassigned (no fake ETAs)
  // instead of creating routes with null ETAs or failing the whole run when
  // only a small number are skipped.
  let skipped = null;
  if (missingShipmentIndices.length > 0) {
    const missingOrders = missingShipmentIndices.flatMap((idx) => {
      const group = groupedOrders[idx];
      const orders = Array.isArray(group?.orders) ? group.orders : [];
      return orders.map((o) => ({
        _id: o?._id?.toString?.() || String(o?._id || ""),
        orderId: o?.orderId || "",
        postcode: o?.deliveryAddress?.postcode || "",
        addressLine1: o?.deliveryAddress?.line1 || "",
        lat: isFiniteNumber(o?.location?.lat)
          ? Number(o.location.lat)
          : undefined,
        lng: isFiniteNumber(o?.location?.lng)
          ? Number(o.location.lng)
          : undefined,
        distanceFromWarehouseKm:
          isValidLatLng(WAREHOUSE_LAT, WAREHOUSE_LNG) &&
          isValidLatLng(o?.location?.lat, o?.location?.lng)
            ? Math.round(
                haversineKm(
                  WAREHOUSE_LAT,
                  WAREHOUSE_LNG,
                  Number(o.location.lat),
                  Number(o.location.lng),
                ) * 10,
              ) / 10
            : undefined,
      }));
    });

    const startMs = new Date(globalStartTime).getTime();
    const endMs = new Date(globalEndTime).getTime();
    const horizonMinutes =
      Number.isFinite(startMs) && Number.isFinite(endMs)
        ? Math.max(0, Math.round((endMs - startMs) / 60000))
        : undefined;

    const windowLabel = effectiveStart
      ? effectiveEnd
        ? `${effectiveStart}–${effectiveEnd}`
        : `${effectiveStart}–(no end)`
      : effectiveEnd
        ? `(no start)–${effectiveEnd}`
        : "(no window)";

    const bufferLabel =
      hasFixedEndTime && lastReturnToDepotBufferHours
        ? `; return buffer ${lastReturnToDepotBufferHours}h`
        : "";

    const firstMissing = Array.isArray(missingOrders) ? missingOrders[0] : null;
    const missingLabel = firstMissing
      ? ` Skipped: ${firstMissing.orderId || firstMissing._id || ""}${firstMissing.postcode ? ` (${firstMissing.postcode})` : ""}${typeof firstMissing.distanceFromWarehouseKm === "number" ? ` ~${firstMissing.distanceFromWarehouseKm}km from depot` : ""}.`
      : "";

    const defaultAllowedSkips = Math.min(
      3,
      Math.max(1, Math.floor((shipments?.length || 0) * 0.02)),
    );
    const envAllowedSkips =
      process.env.MAX_SKIPPED_SHIPMENTS_ALLOWED !== undefined
        ? Number(process.env.MAX_SKIPPED_SHIPMENTS_ALLOWED)
        : undefined;
    const allowedSkips = Number.isFinite(envAllowedSkips)
      ? Math.max(0, envAllowedSkips)
      : defaultAllowedSkips;

    skipped = {
      skippedShipments: optimized?.skippedShipments || undefined,
      missingShipmentsCount: missingShipmentIndices.length,
      missingOrders,
      allowedSkips,
      driversCount: drivers.length,
      vehiclesCount: requestBody?.model?.vehicles?.length || drivers.length,
      note:
        missingShipmentIndices.length <= allowedSkips
          ? "Proceeding with partial plan; skipped orders remain unassigned."
          : "Too many skipped shipments to proceed.",
      debug: {
        windowLabel,
        horizonMinutes,
        bufferLabel,
        missingLabel,
      },
    };

    if (missingShipmentIndices.length > allowedSkips) {
      return {
        success: false,
        statusCode: 400,
        message: `Cannot generate accurate ETAs: optimizer skipped ${missingShipmentIndices.length} shipment(s) within window ${windowLabel}${typeof horizonMinutes === "number" ? ` (${horizonMinutes} min)` : ""}${bufferLabel}.${missingLabel} Increase the delivery window (endTime), add more drivers, or reduce service times.`,
        data: {
          deliveryWindow: {
            tz: DELIVERY_TIME_ZONE,
            startTime: effectiveStart,
            endTime: effectiveEnd,
            globalStartTime,
            globalEndTime,
            optimizationGlobalEndTime,
            returnToDepotBufferHours: lastReturnToDepotBufferHours,
            horizonMinutes,
            hasFixedEndTime,
          },
          serviceTimeSeconds: {
            min: STOP_SERVICE_MIN_SECONDS,
            base: STOP_SERVICE_BASE_SECONDS,
            perOrder: STOP_SERVICE_PER_ORDER_SECONDS,
            max: STOP_SERVICE_MAX_SECONDS,
          },
          counts: {
            orders: orders?.length || 0,
            groupedStops: groupedOrders.length,
            shipments: shipments.length,
            drivers: drivers.length,
          },
          skipped,
        },
      };
    }

    // Continue generating routes for the scheduled visits only.
    // Skipped orders will remain unassigned and will not get Stop entries.
    missingShipmentIndices = [];
  }

  // Ensure the optimizer returned explicit startTime per scheduled visit.
  // Without it, Stop.estimatedArrival would be null and ETA would not display.
  let missingVisitStartTimes = 0;
  for (const r of optimized?.routes || []) {
    for (const v of r?.visits || []) {
      if (!v) continue;
      if (v.shipmentIndex === undefined || v.shipmentIndex === null) continue;
      if (!v.startTime) missingVisitStartTimes++;
    }
  }
  if (missingVisitStartTimes > 0) {
    return {
      success: false,
      statusCode: 400,
      message:
        "Cannot generate accurate ETAs: optimizer did not return startTime for some visits.",
      data: {
        missingVisitStartTimes,
      },
    };
  }

  // At this point optimization is good enough to replace existing data.
  if (existingRouteIds.length > 0) {
    await Stop.deleteMany({ route: { $in: existingRouteIds } });
    await Route.deleteMany({ _id: { $in: existingRouteIds } });
  }

  const createdRouteIds = [];
  const createdRoutes = [];

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
        const totalStops = missingShipmentIndices.reduce((sum, idx) => {
          const group = groupedOrders[idx];
          return sum + (Array.isArray(group?.orders) ? group.orders.length : 0);
        }, 0);

        const route = await Route.create({
          batch: batch._id,
          driver: driverId,
          totalStops,
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
      skipped,
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
