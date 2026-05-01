"use strict";

const mongoose = require("mongoose");
const DeliveryBatch = require("../../models/deliveryBatch.model");
const Order = require("../../models/order.model");
const Route = require("../../models/route.model");
const Stop = require("../../models/stop.model");
const User = require("../../models/user.model");
const Role = require("../../models/role.model");
const { generateGoogleMapsLink } = require("../../utils/navigation.util");
const { generateRoutesForBatch } = require("../route.service");
const { getRouteStockAggregation } = require("../warehouse.service");
const { isDriverUser, getUserId } = require("../../utils/deliveryHelpers.util");

async function resequenceRouteStops(routeId, session) {
  const stops = await Stop.find({ route: routeId })
    .sort({ sequence: 1, createdAt: 1, _id: 1 })
    .select("_id sequence")
    .session(session);

  if (!stops.length) return 0;

  const ops = [];
  for (let index = 0; index < stops.length; index += 1) {
    const nextSequence = index + 1;
    if (Number(stops[index].sequence) === nextSequence) continue;

    ops.push({
      updateOne: {
        filter: { _id: stops[index]._id },
        update: { $set: { sequence: nextSequence } },
      },
    });
  }

  if (ops.length) {
    await Stop.bulkWrite(ops, { session });
  }

  return stops.length;
}

async function generateRoutes({
  batchId,
  driverIds,
  driverConfigs,
  manualAssignments,
  startTime,
  endTime,
} = {}) {
  try {
    const result = await generateRoutesForBatch({
      batchId,
      driverIds,
      driverConfigs,
      manualAssignments,
      startTime,
      endTime,
    });
    if (!result.success) {
      return {
        success: false,
        statusCode: 400,
        message: result.message || "Failed to generate routes",
        data: result.data,
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (err) {
    console.error("Generate routes error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to generate routes",
    };
  }
}

async function getBatch({ batchId, user } = {}) {
  try {
    if (!batchId) {
      return {
        success: false,
        statusCode: 400,
        message: "batchId is required",
      };
    }

    const userId = getUserId(user);
    const driverScoped = isDriverUser(user) && Boolean(userId);

    if (!driverScoped) {
      const batch = await DeliveryBatch.findById(batchId)
        .populate({
          path: "orders",
          populate: { path: "customer", select: "firstName lastName phone" },
        })
        .populate({
          path: "routes",
          populate: {
            path: "driver",
            select: "name email",
          },
        });

      if (!batch) {
        return { success: false, statusCode: 404, message: "Batch not found" };
      }

      return {
        success: true,
        data: batch,
      };
    }

    const batch = await DeliveryBatch.findById(batchId)
      .populate({
        path: "routes",
        populate: {
          path: "driver",
          select: "name email",
        },
      })
      .lean();

    if (!batch) {
      return { success: false, statusCode: 404, message: "Batch not found" };
    }

    const allRoutes = Array.isArray(batch.routes) ? batch.routes : [];
    const routes = allRoutes.filter((r) => {
      const driver = r?.driver;
      const driverId = driver
        ? String(
            typeof driver === "string" ? driver : driver._id || driver.id || "",
          )
        : "";
      return driverId && driverId === userId;
    });

    if (!routes.length) {
      return { success: false, statusCode: 404, message: "Batch not found" };
    }

    const routeIds = routes.map((r) => r._id).filter(Boolean);
    const orderIds = await Stop.distinct("order", { route: { $in: routeIds } });

    const orders = await Order.find({ _id: { $in: orderIds } })
      .populate("customer", "firstName lastName phone")
      .lean();

    return {
      success: true,
      data: {
        ...batch,
        routes,
        orders,
      },
    };
  } catch (err) {
    console.error("Get batch error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to fetch batch",
    };
  }
}

async function getRoute({ routeId, user } = {}) {
  try {
    if (!routeId) {
      return {
        success: false,
        statusCode: 400,
        message: "routeId is required",
      };
    }

    const route = await Route.findById(routeId)
      .populate("driver", "name email")
      .lean();

    if (!route) {
      return { success: false, statusCode: 404, message: "Route not found" };
    }

    const userId = getUserId(user);
    const driverScoped = isDriverUser(user) && Boolean(userId);
    if (driverScoped) {
      const routeDriver = route?.driver;
      const routeDriverId = routeDriver
        ? String(
            typeof routeDriver === "string"
              ? routeDriver
              : routeDriver._id || routeDriver.id || "",
          )
        : "";

      if (!routeDriverId || routeDriverId !== userId) {
        return { success: false, statusCode: 404, message: "Route not found" };
      }
    }

    const stops = await Stop.find({ route: routeId })
      .sort({ sequence: 1 })
      .populate({
        path: "order",
        populate: { path: "customer", select: "firstName lastName phone" },
      })
      .lean();

    const enrichedStops = stops.map((stop) => ({
      ...stop,
      navigationUrl:
        stop?.order?.location?.lat != null && stop?.order?.location?.lng != null
          ? generateGoogleMapsLink(
              stop.order.location.lat,
              stop.order.location.lng,
            )
          : null,
    }));

    return {
      success: true,
      data: {
        route,
        stops: enrichedStops,
      },
    };
  } catch (err) {
    console.error("Get route error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to fetch route",
    };
  }
}

async function getRouteStock({ routeId, user } = {}) {
  try {
    const userId = getUserId(user);
    const driverScoped = isDriverUser(user) && Boolean(userId);

    if (driverScoped) {
      if (!routeId) {
        return {
          success: false,
          statusCode: 400,
          message: "routeId is required",
        };
      }

      const route = await Route.findById(routeId).select("driver").lean();
      if (!route) {
        return { success: false, statusCode: 404, message: "Route not found" };
      }

      const routeDriverId = route?.driver ? String(route.driver) : "";
      if (!routeDriverId || routeDriverId !== userId) {
        return { success: false, statusCode: 404, message: "Route not found" };
      }
    }

    const result = await getRouteStockAggregation({ routeId });
    if (!result.success) {
      return {
        success: false,
        statusCode: 400,
        message: result.message || "Failed to generate stock list",
      };
    }

    return {
      success: true,
      data: result.data,
    };
  } catch (err) {
    console.error("Warehouse aggregation error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to generate stock list",
    };
  }
}

async function reassignStopDriver({ stopId, driverId } = {}) {
  const normalizedStopId = String(stopId || "").trim();
  const normalizedDriverId = String(driverId || "").trim();

  if (!normalizedStopId) {
    return {
      success: false,
      statusCode: 400,
      message: "stopId is required",
    };
  }

  if (!normalizedDriverId) {
    return {
      success: false,
      statusCode: 400,
      message: "driverId is required",
    };
  }

  if (!mongoose.Types.ObjectId.isValid(normalizedStopId)) {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid stopId",
    };
  }

  if (!mongoose.Types.ObjectId.isValid(normalizedDriverId)) {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid driverId",
    };
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const stop = await Stop.findById(normalizedStopId)
      .select("_id route order sequence")
      .session(session);

    if (!stop) {
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        statusCode: 404,
        message: "Stop not found",
      };
    }

    const sourceRoute = await Route.findById(stop.route)
      .select("_id batch driver totalStops")
      .session(session);

    if (!sourceRoute) {
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        statusCode: 404,
        message: "Source route not found",
      };
    }

    const driverRole = await Role.findOne({ name: "driver" })
      .select("_id")
      .session(session);

    const targetDriver = await User.findById(normalizedDriverId)
      .select("_id name email status role")
      .session(session);

    if (!targetDriver || String(targetDriver.status) !== "active") {
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        statusCode: 404,
        message: "Driver not found",
      };
    }

    if (
      !driverRole ||
      String(targetDriver.role || "") !== String(driverRole._id || "")
    ) {
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        statusCode: 400,
        message: "Selected user is not a driver",
      };
    }

    const sourceDriverId = String(sourceRoute.driver || "");
    if (sourceDriverId && sourceDriverId === normalizedDriverId) {
      await session.abortTransaction();
      session.endSession();
      return {
        success: true,
        data: {
          stopId: String(stop._id),
          routeId: String(sourceRoute._id),
          driverId: normalizedDriverId,
          createdRoute: false,
          removedEmptyRoute: false,
        },
      };
    }

    const batch = await DeliveryBatch.findById(sourceRoute.batch)
      .select("_id routes")
      .session(session);

    if (!batch) {
      await session.abortTransaction();
      session.endSession();
      return {
        success: false,
        statusCode: 404,
        message: "Batch not found",
      };
    }

    let targetRoute = await Route.findOne({
      batch: batch._id,
      driver: targetDriver._id,
    })
      .select("_id batch driver totalStops")
      .session(session);

    let createdRoute = false;
    if (!targetRoute) {
      [targetRoute] = await Route.create(
        [
          {
            batch: batch._id,
            driver: targetDriver._id,
            totalStops: 0,
            totalDistanceMeters: 0,
            totalDurationSeconds: 0,
            polyline: "",
            status: "planned",
          },
        ],
        { session },
      );

      createdRoute = true;

      await DeliveryBatch.updateOne(
        { _id: batch._id },
        { $addToSet: { routes: targetRoute._id } },
        { session },
      );
    }

    const targetStopCount = await Stop.countDocuments({
      route: targetRoute._id,
    }).session(session);

    stop.route = targetRoute._id;
    stop.sequence = targetStopCount + 1;
    await stop.save({ session });

    const sourceCount = await resequenceRouteStops(sourceRoute._id, session);
    const targetCount = await resequenceRouteStops(targetRoute._id, session);

    let removedEmptyRoute = false;

    if (sourceCount === 0) {
      await Route.deleteOne({ _id: sourceRoute._id }).session(session);
      await DeliveryBatch.updateOne(
        { _id: batch._id },
        { $pull: { routes: sourceRoute._id } },
        { session },
      );
      removedEmptyRoute = true;
    } else {
      await Route.updateOne(
        { _id: sourceRoute._id },
        { $set: { totalStops: sourceCount } },
        { session },
      );
    }

    await Route.updateOne(
      { _id: targetRoute._id },
      { $set: { totalStops: targetCount } },
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    return {
      success: true,
      data: {
        stopId: String(stop._id),
        routeId: String(targetRoute._id),
        driverId: String(targetDriver._id),
        createdRoute,
        removedEmptyRoute,
      },
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Reassign stop driver error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to reassign stop driver",
    };
  }
}

module.exports = {
  generateRoutes,
  getBatch,
  getRoute,
  getRouteStock,
  reassignStopDriver,
};
