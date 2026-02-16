const mongoose = require("mongoose");
const DeliveryBatch = require("../models/deliveryBatch.model");
const Order = require("../models/order.model");

const Route = require("../models/route.model");
const Stop = require("../models/stop.model");

const { generateRoutesForBatch } = require("./route.service");
const { getRouteStockAggregation } = require("./warehouse.service");
const { generateGoogleMapsLink } = require("../utils/navigation.util");

/**
 * Create a delivery batch for a specific date
 */
async function createDeliveryBatch({ deliveryDate }) {
  if (!deliveryDate) {
    return { success: false, message: "deliveryDate is required" };
  }

  const date = new Date(deliveryDate);

  if (Number.isNaN(date.getTime())) {
    return { success: false, message: "Invalid deliveryDate" };
  }

  // Normalize to start of day (UTC)
  const startOfDay = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );

  const endOfDay = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );

  // Prevent duplicate batch
  const existingBatch = await DeliveryBatch.findOne({
    deliveryDate: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  });

  if (existingBatch) {
    return {
      success: false,
      message: "Batch already exists for this delivery date",
    };
  }

  // Find eligible orders
  const eligibleOrders = await Order.find({
    deliveryDate: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
    status: "paid",
  }).select("_id");

  if (eligibleOrders.length === 0) {
    return {
      success: false,
      message: "No eligible orders found for this date",
    };
  }

  const orderIds = eligibleOrders.map((o) => o._id);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [batch] = await DeliveryBatch.create(
      [
        {
          deliveryDate: startOfDay,
          status: "locked",
          orders: orderIds,
          lockedAt: new Date(),
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    return {
      success: true,
      data: {
        batchId: batch._id,
        totalOrders: orderIds.length,
      },
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error("Error creating delivery batch:", err);

    return {
      success: false,
      message: "Failed to create delivery batch",
    };
  }
}

async function generateRoutes({ batchId } = {}) {
  try {
    const result = await generateRoutesForBatch({ batchId });
    if (!result.success) {
      return {
        success: false,
        statusCode: 400,
        message: result.message || "Failed to generate routes",
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

async function getBatch({ batchId } = {}) {
  try {
    if (!batchId) {
      return {
        success: false,
        statusCode: 400,
        message: "batchId is required",
      };
    }

    const batch = await DeliveryBatch.findById(batchId)
      .populate("orders")
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
  } catch (err) {
    console.error("Get batch error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to fetch batch",
    };
  }
}

async function getRoute({ routeId } = {}) {
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

    const stops = await Stop.find({ route: routeId })
      .sort({ sequence: 1 })
      .populate("order")
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

async function getRouteStock({ routeId } = {}) {
  try {
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

module.exports = {
  createDeliveryBatch,
  generateRoutes,
  getBatch,
  getRoute,
  getRouteStock,
};
