const DeliveryBatch = require("../models/deliveryBatch.model");
const Route = require("../models/route.model");
const Stop = require("../models/stop.model");
const Order = require("../models/order.model");
const User = require("../models/user.model");
const Role = require("../models/role.model");

const { optimizeRoutes } = require("./googleRoute.service");

const WAREHOUSE_LAT = Number(process.env.WAREHOUSE_LAT);
const WAREHOUSE_LNG = Number(process.env.WAREHOUSE_LNG);

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

async function generateRoutesForBatch({ batchId }) {
  const batch = await DeliveryBatch.findById(batchId);
  if (!batch) return { success: false, message: "Batch not found" };

  const orders = await Order.find({
    _id: { $in: batch.orders },
  }).lean();

  const driverRole = await Role.findOne({ name: "driver" });
  const drivers = await User.find({
    role: driverRole._id,
    status: "active",
  }).lean();

  if (!drivers.length)
    return { success: false, message: "No active drivers found" };

  const shipments = orders.map((order) => ({
    deliveries: [
      {
        arrivalLocation: {
          latitude: order.location.lat,
          longitude: order.location.lng,
        },
        duration: "300s",
      },
    ],
    loadDemands: {
      weight: { amount: 1 },
    },
  }));

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
      weight: { maxLoad: 100 },
    },
  }));

  const requestBody = {
    // Ask the API to populate route polylines in the response.
    populatePolylines: true,
    populateTransitionPolylines: true,

    model: {
      globalStartTime: new Date(batch.deliveryDate).toISOString(),
      globalEndTime: new Date(
        new Date(batch.deliveryDate).getTime() + 10 * 60 * 60 * 1000,
      ).toISOString(),
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

  for (const routeData of optimized.routes) {
    const polyline = extractEncodedPolyline(routeData);

    const route = await Route.create({
      batch: batch._id,
      driver: routeData.vehicleLabel,
      totalStops: routeData.visits?.length || 0,
      totalDistanceMeters: routeData.metrics?.travelDistanceMeters || 0,
      totalDurationSeconds: parseDuration(routeData.metrics?.travelDuration),
      polyline,
    });

    let sequence = 1;

    for (const visit of routeData.visits || []) {
      if (visit.shipmentIndex === undefined) continue;

      const order = orders[visit.shipmentIndex];

      await Stop.create({
        route: route._id,
        order: order._id,
        sequence,
        estimatedArrival: visit.startTime ? new Date(visit.startTime) : null,
      });

      sequence++;
    }

    createdRouteIds.push(route._id);
  }

  batch.routes = createdRouteIds;
  batch.status = "routes_generated";
  batch.generatedAt = new Date();
  await batch.save();

  return {
    success: true,
    data: {
      routesCreated: createdRouteIds.length,
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
