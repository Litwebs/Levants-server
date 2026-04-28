const DeliveryBatch = require("../models/deliveryBatch.model");
const Route = require("../models/route.model");
const Stop = require("../models/stop.model");
const Order = require("../models/order.model");
const User = require("../models/user.model");
const Role = require("../models/role.model");

const { optimizeRoutes } = require("./googleRoute.service");

const { isValidLatLng, isHHMM } = require("../utils/routeValidation.util");
const {
  parseDurationSeconds,
  resolveOptimizationWindow,
} = require("../utils/routeTime.util");
const {
  extractEncodedPolyline,
  computeServiceSeconds,
  groupOrdersByLocation,
  buildShipmentsFromGroups,
  buildShipmentLookup,
  resolveVisitShipment,
} = require("../utils/routeShipment.util");
const {
  normalizeDriverSelection,
  buildRequestedDriverConfigMap,
  buildManualAssignmentMap,
  countManualAssignmentsByDriver,
  buildEffectiveDriverConfigs,
  validateDriverConfigs,
  validateManualAssignments,
  allocateOrdersByDriverPostcode,
} = require("../utils/routeDriverAllocation.util");

const WAREHOUSE_LAT = Number(process.env.WAREHOUSE_LAT);
const WAREHOUSE_LNG = Number(process.env.WAREHOUSE_LNG);

// ---------------------------------------------------------------------------
// Single-driver optimization
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main entry point – kept below for readability (all helpers are imported)
// ---------------------------------------------------------------------------

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

  const driverFilter = { status: "active" };

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
