const DeliveryBatch = require("../models/deliveryBatch.model");
const Route = require("../models/route.model");
const Stop = require("../models/stop.model");
const Order = require("../models/order.model");
const User = require("../models/user.model");
const Role = require("../models/role.model");

const { optimizeRoutes } = require("./googleRoute.service");
const {
  normalizeDriverRouting,
  parseUkPostcode,
  matchesRoutingArea,
} = require("../utils/driverRouting.util");

const WAREHOUSE_LAT = Number(process.env.WAREHOUSE_LAT);
const WAREHOUSE_LNG = Number(process.env.WAREHOUSE_LNG);

const DELIVERY_TIME_ZONE =
  process.env.DELIVERY_TIME_ZONE ||
  process.env.BUSINESS_TIME_ZONE ||
  "Europe/London";

function isFiniteNumber(n) {
  // Checks if n is a number and is not NaN or Infinity
  return typeof n === "number" && Number.isFinite(n);
}

function isValidLatLng(lat, lng) {
  // check if lat and lng are finite numbers
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

function extractEncodedPolyline(routeData) {
  // The structure of the route data can vary based on the optimization request and response.
  if (!routeData || typeof routeData !== "object") return null;

  const points =
    routeData.routePolyline?.points || routeData.polyline?.points || null;

  return typeof points === "string" && points.trim() ? points : null;
}

function isHHMM(value) {
  // Checks if the value is a string in "HH:MM" 24-hour format
  if (typeof value !== "string") return false;
  if (!/^\d{2}:\d{2}$/.test(value)) return false;

  const [hh, mm] = value.split(":").map(Number);

  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return false;
  if (hh < 0 || hh > 23) return false;
  if (mm < 0 || mm > 59) return false;

  return true;
}

function parseDurationSeconds(value) {
  // Parses a duration value that can be a number (assumed to be seconds) or a string like "5s", "2m", "1h"
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

function distanceSq(aLat, aLng, bLat, bLng) {
  const dLat = aLat - bLat;
  const dLng = aLng - bLng;
  return dLat * dLat + dLng * dLng;
}

function totalOrdersInGroup(group) {
  return Array.isArray(group.orders) ? group.orders.length : 0;
}

function buildNearestNeighborGraph(groups, neighborCount = 6) {
  const graph = groups.map(() => new Set());

  for (let i = 0; i < groups.length; i++) {
    const distances = [];

    for (let j = 0; j < groups.length; j++) {
      if (i === j) continue;

      distances.push({
        index: j,
        dist: distanceSq(
          groups[i].lat,
          groups[i].lng,
          groups[j].lat,
          groups[j].lng,
        ),
      });
    }

    distances.sort((a, b) => a.dist - b.dist);

    for (const item of distances.slice(0, neighborCount)) {
      graph[i].add(item.index);
      graph[item.index].add(i);
    }
  }

  return graph;
}

function pickTerritorySeeds(groups, k) {
  const seeds = [];
  const sorted = [...groups]
    .map((group, index) => ({
      index,
      orders: totalOrdersInGroup(group),
      lat: group.lat,
      lng: group.lng,
    }))
    .sort((a, b) => b.orders - a.orders);

  if (!sorted.length) return seeds;

  seeds.push(sorted[0].index);

  while (seeds.length < k && seeds.length < groups.length) {
    let bestIndex = null;
    let bestScore = -1;

    for (let i = 0; i < groups.length; i++) {
      if (seeds.includes(i)) continue;

      const minDistToSeed = Math.min(
        ...seeds.map((seedIndex) =>
          distanceSq(
            groups[i].lat,
            groups[i].lng,
            groups[seedIndex].lat,
            groups[seedIndex].lng,
          ),
        ),
      );

      const weightedScore =
        minDistToSeed * Math.max(1, totalOrdersInGroup(groups[i]));

      if (weightedScore > bestScore) {
        bestScore = weightedScore;
        bestIndex = i;
      }
    }

    if (bestIndex === null) break;
    seeds.push(bestIndex);
  }

  return seeds;
}

function clusterGroupedOrdersGeographically(groupedOrders, drivers) {
  const k = drivers.length;

  if (k === 1) {
    return [
      {
        driver: drivers[0],
        groups: groupedOrders,
        totalOrders: groupedOrders.reduce(
          (sum, group) => sum + totalOrdersInGroup(group),
          0,
        ),
      },
    ];
  }

  if (groupedOrders.length < k) {
    return drivers.map((driver, index) => ({
      driver,
      groups: groupedOrders[index] ? [groupedOrders[index]] : [],
      totalOrders: groupedOrders[index]
        ? totalOrdersInGroup(groupedOrders[index])
        : 0,
    }));
  }

  const graph = buildNearestNeighborGraph(groupedOrders, 6);
  const seeds = pickTerritorySeeds(groupedOrders, k);

  const assignments = new Array(groupedOrders.length).fill(-1);

  const buckets = drivers.map((driver, bucketIndex) => ({
    driver,
    bucketIndex,
    groups: [],
    totalOrders: 0,
    frontier: [],
  }));

  const totalOrdersAll = groupedOrders.reduce(
    (sum, group) => sum + totalOrdersInGroup(group),
    0,
  );

  const targetOrdersPerDriver = totalOrdersAll / k;

  for (let bucketIndex = 0; bucketIndex < seeds.length; bucketIndex++) {
    const seedIndex = seeds[bucketIndex];
    assignments[seedIndex] = bucketIndex;
    buckets[bucketIndex].groups.push(groupedOrders[seedIndex]);
    buckets[bucketIndex].totalOrders += totalOrdersInGroup(
      groupedOrders[seedIndex],
    );
    buckets[bucketIndex].frontier.push(seedIndex);
  }

  const unassigned = new Set(
    groupedOrders
      .map((_, index) => index)
      .filter((index) => assignments[index] === -1),
  );

  function addNeighborsToFrontier(bucketIndex, fromIndex) {
    for (const neighborIndex of graph[fromIndex]) {
      if (assignments[neighborIndex] === -1) {
        buckets[bucketIndex].frontier.push(neighborIndex);
      }
    }
  }

  for (let bucketIndex = 0; bucketIndex < buckets.length; bucketIndex++) {
    const seedIndex = seeds[bucketIndex];
    if (seedIndex !== undefined) {
      addNeighborsToFrontier(bucketIndex, seedIndex);
    }
  }

  while (unassigned.size > 0) {
    let progress = false;

    const bucketOrder = [...buckets].sort(
      (a, b) => a.totalOrders - b.totalOrders,
    );

    for (const bucket of bucketOrder) {
      let bestIndex = null;
      let bestScore = Number.POSITIVE_INFINITY;

      const seen = new Set();

      for (const candidateIndex of bucket.frontier) {
        if (seen.has(candidateIndex)) continue;
        seen.add(candidateIndex);

        if (assignments[candidateIndex] !== -1) continue;

        const candidateGroup = groupedOrders[candidateIndex];

        const nearestAssignedDist = bucket.groups.length
          ? Math.min(
              ...bucket.groups.map((assignedGroup) =>
                distanceSq(
                  candidateGroup.lat,
                  candidateGroup.lng,
                  assignedGroup.lat,
                  assignedGroup.lng,
                ),
              ),
            )
          : 0;

        const overloadPenalty =
          Math.max(
            0,
            bucket.totalOrders +
              totalOrdersInGroup(candidateGroup) -
              targetOrdersPerDriver,
          ) * 0.0008;

        const score = nearestAssignedDist + overloadPenalty;

        if (score < bestScore) {
          bestScore = score;
          bestIndex = candidateIndex;
        }
      }

      if (bestIndex === null) {
        for (const candidateIndex of unassigned) {
          const candidateGroup = groupedOrders[candidateIndex];

          const nearestAssignedDist = bucket.groups.length
            ? Math.min(
                ...bucket.groups.map((assignedGroup) =>
                  distanceSq(
                    candidateGroup.lat,
                    candidateGroup.lng,
                    assignedGroup.lat,
                    assignedGroup.lng,
                  ),
                ),
              )
            : 0;

          const overloadPenalty =
            Math.max(
              0,
              bucket.totalOrders +
                totalOrdersInGroup(candidateGroup) -
                targetOrdersPerDriver,
            ) * 0.0008;

          const score = nearestAssignedDist + overloadPenalty;

          if (score < bestScore) {
            bestScore = score;
            bestIndex = candidateIndex;
          }
        }
      }

      if (bestIndex !== null) {
        assignments[bestIndex] = bucket.bucketIndex;
        bucket.groups.push(groupedOrders[bestIndex]);
        bucket.totalOrders += totalOrdersInGroup(groupedOrders[bestIndex]);
        unassigned.delete(bestIndex);
        addNeighborsToFrontier(bucket.bucketIndex, bestIndex);
        progress = true;
      }
    }

    if (!progress) break;
  }

  for (const index of unassigned) {
    const group = groupedOrders[index];

    let bestBucketIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const bucket of buckets) {
      const nearestAssignedDist = bucket.groups.length
        ? Math.min(
            ...bucket.groups.map((assignedGroup) =>
              distanceSq(
                group.lat,
                group.lng,
                assignedGroup.lat,
                assignedGroup.lng,
              ),
            ),
          )
        : 0;

      const overloadPenalty =
        Math.max(
          0,
          bucket.totalOrders +
            totalOrdersInGroup(group) -
            targetOrdersPerDriver,
        ) * 0.0008;

      const score = nearestAssignedDist + overloadPenalty;

      if (score < bestScore) {
        bestScore = score;
        bestBucketIndex = bucket.bucketIndex;
      }
    }

    buckets[bestBucketIndex].groups.push(group);
    buckets[bestBucketIndex].totalOrders += totalOrdersInGroup(group);
  }

  return buckets.map((bucket, index) => ({
    driver: drivers[index],
    groups: bucket.groups,
    totalOrders: bucket.totalOrders,
  }));
}

function improveClusterBoundaries(buckets, iterations = 4) {
  const allGroups = [];
  const ownership = new Map();

  buckets.forEach((bucket, bucketIndex) => {
    bucket.groups.forEach((group) => {
      allGroups.push(group);
      ownership.set(group, bucketIndex);
    });
  });

  for (let iter = 0; iter < iterations; iter++) {
    let movedAny = false;

    for (const group of allGroups) {
      const currentBucketIndex = ownership.get(group);

      const neighbors = allGroups
        .filter((other) => other !== group)
        .map((other) => ({
          group: other,
          bucketIndex: ownership.get(other),
          dist: distanceSq(group.lat, group.lng, other.lat, other.lng),
        }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 6);

      const votes = new Map();

      for (const neighbor of neighbors) {
        votes.set(
          neighbor.bucketIndex,
          (votes.get(neighbor.bucketIndex) || 0) + 1,
        );
      }

      let bestBucketIndex = currentBucketIndex;
      let bestVotes = votes.get(currentBucketIndex) || 0;

      for (const [bucketIndex, count] of votes.entries()) {
        if (count > bestVotes) {
          bestVotes = count;
          bestBucketIndex = bucketIndex;
        }
      }

      if (bestBucketIndex !== currentBucketIndex) {
        const fromBucket = buckets[currentBucketIndex];
        const toBucket = buckets[bestBucketIndex];

        if (!fromBucket || !toBucket) continue;
        if (fromBucket.groups.length <= 1) continue;

        fromBucket.groups = fromBucket.groups.filter((g) => g !== group);
        fromBucket.totalOrders -= totalOrdersInGroup(group);

        toBucket.groups.push(group);
        toBucket.totalOrders += totalOrdersInGroup(group);

        ownership.set(group, bestBucketIndex);
        movedAny = true;
      }
    }

    if (!movedAny) break;
  }

  return buckets;
}

async function optimizeSingleDriverRoute({
  driver,
  assignedGroups,
  startTime,
  endTime,
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
      globalStartTime: startTime,
      globalEndTime: endTime,
      shipments,
      vehicles: [
        {
          label: String(driver._id),
          startLocation: {
            latitude: WAREHOUSE_LAT,
            longitude: WAREHOUSE_LNG,
          },
          // endLocation: {
          //   latitude: WAREHOUSE_LAT,
          //   longitude: WAREHOUSE_LNG,
          // },
          costPerHour: 1,
          costPerKilometer: 0.001,
        },
      ],
    },
  };

  const optimized = await optimizeRoutes(requestBody);

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

function normalizeDriverSelection({ driverIds, driverConfigs }) {
  const idSet = new Set();

  if (Array.isArray(driverIds)) {
    for (const driverId of driverIds) {
      const next = String(driverId || "").trim();
      if (next) idSet.add(next);
    }
  }

  if (Array.isArray(driverConfigs)) {
    for (const config of driverConfigs) {
      const next = String(config?.driverId || "").trim();
      if (next) idSet.add(next);
    }
  }

  return Array.from(idSet);
}

function buildRequestedDriverConfigMap(driverConfigs) {
  const byDriverId = new Map();

  for (const config of Array.isArray(driverConfigs) ? driverConfigs : []) {
    const driverId = String(config?.driverId || "").trim();
    if (!driverId) continue;

    byDriverId.set(driverId, normalizeDriverRouting(config));
  }

  return byDriverId;
}

function buildManualAssignmentMap(manualAssignments) {
  const byOrderId = new Map();

  for (const assignment of Array.isArray(manualAssignments)
    ? manualAssignments
    : []) {
    const orderDbId = String(assignment?.orderDbId || "").trim();
    const driverId = String(assignment?.driverId || "").trim();

    if (!orderDbId || !driverId) continue;
    byOrderId.set(orderDbId, driverId);
  }

  return byOrderId;
}

function countManualAssignmentsByDriver(manualAssignmentMap) {
  const counts = new Map();

  for (const driverId of manualAssignmentMap.values()) {
    counts.set(driverId, (counts.get(driverId) || 0) + 1);
  }

  return counts;
}

function buildEffectiveDriverConfigs({
  drivers,
  requestedConfigs,
  fallbackStartTime,
}) {
  return drivers.map((driver) => {
    const driverId = String(driver._id);
    const persisted = normalizeDriverRouting(driver.driverRouting || {});
    const override = requestedConfigs.get(driverId);
    const merged = normalizeDriverRouting({
      postcodeAreas:
        Array.isArray(override?.postcodeAreas) &&
        override.postcodeAreas.length > 0
          ? override.postcodeAreas
          : persisted.postcodeAreas,
      routeStartTime:
        override?.routeStartTime ||
        persisted.routeStartTime ||
        (typeof fallbackStartTime === "string" &&
        isHHMM(fallbackStartTime.trim())
          ? fallbackStartTime.trim()
          : null),
    });

    return {
      driverId,
      driver,
      postcodeAreas: merged.postcodeAreas,
      routeStartTime: merged.routeStartTime,
    };
  });
}

function validateDriverConfigs(
  driverConfigs,
  manualAssignmentCounts = new Map(),
) {
  const errors = [];

  for (const config of driverConfigs) {
    const manualAssignmentsCount = Number(
      manualAssignmentCounts.get(config.driverId) || 0,
    );

    if (
      !Array.isArray(config.postcodeAreas) ||
      (config.postcodeAreas.length === 0 && manualAssignmentsCount === 0)
    ) {
      errors.push({
        type: "DRIVER_POSTCODE_AREAS_MISSING",
        driverId: config.driverId,
        message:
          manualAssignmentsCount > 0
            ? `${config.driver.name} needs postcode areas for any auto-assigned stops`
            : `${config.driver.name} has no assigned postcode areas`,
      });
    }

    if (!config.routeStartTime || !isHHMM(config.routeStartTime)) {
      errors.push({
        type: "DRIVER_START_TIME_MISSING",
        driverId: config.driverId,
        message: `${config.driver.name} has no valid route start time`,
      });
    }
  }

  return errors;
}

function validateManualAssignments({
  manualAssignmentMap,
  driverConfigs,
  orders,
}) {
  const errors = [];
  const driverIds = new Set(driverConfigs.map((config) => config.driverId));
  const orderIds = new Set(orders.map((order) => String(order._id)));

  for (const [orderDbId, driverId] of manualAssignmentMap.entries()) {
    if (!orderIds.has(orderDbId)) {
      errors.push({
        type: "MANUAL_ASSIGNMENT_ORDER_INVALID",
        orderDbId,
        driverId,
        message: `Manual assignment references an order that is not in this batch: ${orderDbId}`,
      });
    }

    if (!driverIds.has(driverId)) {
      errors.push({
        type: "MANUAL_ASSIGNMENT_DRIVER_INVALID",
        orderDbId,
        driverId,
        message: `Manual assignment references a driver that is not selected: ${driverId}`,
      });
    }
  }

  return errors;
}

function allocateOrdersByDriverPostcode({
  orders,
  driverConfigs,
  manualAssignmentMap,
}) {
  const buckets = new Map(driverConfigs.map((config) => [config.driverId, []]));
  const warnings = [];
  const assignedOrderIds = new Set();
  const driverConfigById = new Map(
    driverConfigs.map((config) => [config.driverId, config]),
  );

  for (const order of orders) {
    const orderDbId = String(order._id);
    const manuallyAssignedDriverId = manualAssignmentMap.get(orderDbId);

    if (manuallyAssignedDriverId) {
      const selectedDriver = driverConfigById.get(manuallyAssignedDriverId);
      if (selectedDriver) {
        buckets.get(selectedDriver.driverId).push(order);
        assignedOrderIds.add(orderDbId);
        continue;
      }
    }

    const postcodeValue = String(order?.deliveryAddress?.postcode || "").trim();
    const parsedPostcode = parseUkPostcode(postcodeValue);

    if (!parsedPostcode.compact || !parsedPostcode.isValid) {
      warnings.push({
        type: "BAD_ADDRESS",
        message: `Order ${order.orderId} has an invalid or missing delivery postcode`,
        orderId: String(order.orderId || ""),
        orderDbId: String(order._id),
        postcode: postcodeValue,
      });
      continue;
    }

    const matches = driverConfigs.filter((config) =>
      config.postcodeAreas.some((area) =>
        matchesRoutingArea(parsedPostcode, area),
      ),
    );

    if (matches.length === 0) {
      warnings.push({
        type: "NO_DRIVER_MATCH",
        message: `Order ${order.orderId} postcode ${parsedPostcode.outward} does not match any selected driver`,
        orderId: String(order.orderId || ""),
        orderDbId: String(order._id),
        postcode: postcodeValue,
      });
      continue;
    }

    if (matches.length > 1) {
      warnings.push({
        type: "MULTIPLE_DRIVER_MATCH",
        message: `Order ${order.orderId} postcode ${parsedPostcode.outward} matches multiple drivers`,
        orderId: String(order.orderId || ""),
        orderDbId: String(order._id),
        postcode: postcodeValue,
        driverIds: matches.map((match) => match.driverId),
      });
      continue;
    }

    const selectedDriver = matches[0];
    buckets.get(selectedDriver.driverId).push(order);
    assignedOrderIds.add(String(order._id));
  }

  return {
    buckets: driverConfigs.map((config) => ({
      ...config,
      orders: buckets.get(config.driverId) || [],
    })),
    warnings,
    assignedOrderIds,
    unassignedOrders: orders.filter(
      (order) => !assignedOrderIds.has(String(order._id)),
    ),
  };
}

async function generateRoutesForBatch({
  batchId,
  driverIds,
  driverConfigs,
  manualAssignments,
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

  const selectedDriverIds = normalizeDriverSelection({
    driverIds,
    driverConfigs,
  });

  if (selectedDriverIds.length > 0) {
    driverFilter._id = { $in: selectedDriverIds };
  }

  const drivers = await User.find(driverFilter).lean();

  if (!drivers.length) {
    return { success: false, message: "No active drivers found" };
  }

  const requestedConfigs = buildRequestedDriverConfigMap(driverConfigs);
  const manualAssignmentMap = buildManualAssignmentMap(manualAssignments);
  const effectiveDriverConfigs = buildEffectiveDriverConfigs({
    drivers,
    requestedConfigs,
    fallbackStartTime: startTime,
  });

  const manualAssignmentErrors = validateManualAssignments({
    manualAssignmentMap,
    driverConfigs: effectiveDriverConfigs,
    orders,
  });
  if (manualAssignmentErrors.length > 0) {
    return {
      success: false,
      statusCode: 400,
      message: manualAssignmentErrors.map((error) => error.message).join(". "),
      validationErrors: manualAssignmentErrors,
    };
  }

  const validationErrors = validateDriverConfigs(
    effectiveDriverConfigs,
    countManualAssignmentsByDriver(manualAssignmentMap),
  );
  if (validationErrors.length > 0) {
    return {
      success: false,
      statusCode: 400,
      message: validationErrors.map((error) => error.message).join(". "),
      validationErrors,
    };
  }

  const allocation = allocateOrdersByDriverPostcode({
    orders,
    driverConfigs: effectiveDriverConfigs,
    manualAssignmentMap,
  });

  const assignedOrdersCount =
    orders.length - allocation.unassignedOrders.length;
  if (assignedOrdersCount === 0) {
    return {
      success: false,
      statusCode: 400,
      message: "No orders matched the selected drivers' postcode areas",
      warnings: allocation.warnings,
      unassignedOrderIds: allocation.unassignedOrders.map((order) =>
        String(order._id),
      ),
    };
  }

  if (existingRouteIds.length > 0) {
    await Stop.deleteMany({ route: { $in: existingRouteIds } });
    await Route.deleteMany({ _id: { $in: existingRouteIds } });
  }

  const optimizationResults = [];

  for (const bucket of allocation.buckets) {
    const assignedGroups = groupOrdersByLocation(bucket.orders);

    if (!assignedGroups.length) {
      optimizationResults.push({
        driver: bucket.driver,
        assignedGroups: [],
        shipmentLookup: buildShipmentLookup([]),
        optimized: { routes: [] },
        routeData: null,
        routeStartTime: bucket.routeStartTime,
      });
      continue;
    }

    const { globalStartTime, globalEndTime } = resolveOptimizationWindow({
      batch,
      startTime: bucket.routeStartTime,
      endTime,
    });

    try {
      const result = await optimizeSingleDriverRoute({
        driver: bucket.driver,
        assignedGroups,
        startTime: globalStartTime,
        endTime: globalEndTime,
      });

      console.log(
        result.routeData?.visits?.map((visit, i) => ({
          index: i + 1,
          shipmentIndex: visit.shipmentIndex,
          shipmentLabel: visit.shipmentLabel,
          startTime: visit.startTime,
        })),
      );

      console.log(
        assignedGroups.map((group, index) => ({
          shipment: `shipment-${index}`,
          lat: group.lat,
          lng: group.lng,
          orders: group.orders.map((o) => o.orderId),
        })),
      );

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

  const routeWarnings = allocation.warnings;

  batch.routes = createdRouteIds;
  batch.status = "routes_generated";
  batch.generatedAt = new Date();

  const sortedStartTimes = effectiveDriverConfigs
    .map((config) => config.routeStartTime)
    .filter((value) => typeof value === "string" && isHHMM(value))
    .sort();

  if (sortedStartTimes.length > 0) {
    batch.deliveryWindowStart = sortedStartTimes[0];
  }

  if (typeof endTime === "string" && isHHMM(endTime.trim())) {
    batch.deliveryWindowEnd = endTime.trim();
  }

  batch.routeGeneration = {
    warnings: routeWarnings,
    driverConfigs: effectiveDriverConfigs.map((config) => ({
      driverId: config.driverId,
      driverName: config.driver.name,
      postcodeAreas: config.postcodeAreas,
      routeStartTime: config.routeStartTime,
    })),
  };

  await batch.save();

  return {
    success: true,
    data: {
      routesCreated: createdRouteIds.length,
      driversUsed: optimizationResults.length,
      ordersCount: orders.length,
      groupedStopsCount: allocation.buckets.reduce(
        (sum, bucket) => sum + groupOrdersByLocation(bucket.orders).length,
        0,
      ),
      assignedGroupedStopsCount: totalAssignedGroups,
      unassignedOrdersCount: unassignedOrders.length,
      warnings: routeWarnings,
      splitSummary: allocation.buckets.map((bucket) => ({
        driverId: String(bucket.driver._id),
        groupedStopsAssignedBeforeOptimization: groupOrdersByLocation(
          bucket.orders,
        ).length,
        ordersAssignedBeforeOptimization: bucket.orders.length,
        routeStartTime: bucket.routeStartTime,
        postcodeAreas: bucket.postcodeAreas,
      })),
    },
  };
}

module.exports = {
  generateRoutesForBatch,
};
