const mongoose = require("mongoose");
const DeliveryBatch = require("../models/deliveryBatch.model");
const Order = require("../models/order.model");
const User = require("../models/user.model");
const Role = require("../models/role.model");

const Route = require("../models/route.model");
const Stop = require("../models/stop.model");

const { generateRoutesForBatch } = require("./route.service");
const { getRouteStockAggregation } = require("./warehouse.service");
const { generateGoogleMapsLink } = require("../utils/navigation.util");

/**
 * Create a delivery batch for a specific date
 */
async function createDeliveryBatch({
  deliveryDate,
  orderIds,
  deliveryWindowStart,
  deliveryWindowEnd,
} = {}) {
  if (!deliveryDate) {
    return { success: false, message: "deliveryDate is required" };
  }

  const startTime =
    typeof deliveryWindowStart === "string" && deliveryWindowStart.trim()
      ? deliveryWindowStart.trim()
      : undefined;
  const endTime =
    typeof deliveryWindowEnd === "string" && deliveryWindowEnd.trim()
      ? deliveryWindowEnd.trim()
      : undefined;

  const hhmm = /^\d{2}:\d{2}$/;
  if (startTime && !hhmm.test(startTime)) {
    return { success: false, message: "startTime must be in HH:mm format" };
  }
  if (endTime && !hhmm.test(endTime)) {
    return { success: false, message: "endTime must be in HH:mm format" };
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
  let selectedOrderIds = [];

  if (Array.isArray(orderIds) && orderIds.length > 0) {
    const unique = Array.from(new Set(orderIds.map((id) => String(id))));
    const validIds = unique.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return { success: false, message: "orderIds must contain valid IDs" };
    }

    const found = await Order.find({
      _id: { $in: validIds },
      status: "paid",
      deliveryDate: { $gte: startOfDay, $lte: endOfDay },
    }).select("_id");

    if (found.length !== validIds.length) {
      return {
        success: false,
        message: "Some selected orders are not eligible for this date",
      };
    }

    selectedOrderIds = found.map((o) => o._id);
  } else {
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

    selectedOrderIds = eligibleOrders.map((o) => o._id);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [batch] = await DeliveryBatch.create(
      [
        {
          deliveryDate: startOfDay,
          status: "locked",
          orders: selectedOrderIds,
          lockedAt: new Date(),
          deliveryWindowStart: startTime,
          deliveryWindowEnd: endTime,
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
        totalOrders: selectedOrderIds.length,
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

function normalizeDateRange({ fromDate, toDate } = {}) {
  const filter = {};
  if (fromDate) {
    const d = new Date(fromDate);
    if (!Number.isNaN(d.getTime())) {
      filter.$gte = new Date(
        Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate(),
          0,
          0,
          0,
          0,
        ),
      );
    }
  }
  if (toDate) {
    const d = new Date(toDate);
    if (!Number.isNaN(d.getTime())) {
      filter.$lte = new Date(
        Date.UTC(
          d.getUTCFullYear(),
          d.getUTCMonth(),
          d.getUTCDate(),
          23,
          59,
          59,
          999,
        ),
      );
    }
  }
  return Object.keys(filter).length ? filter : null;
}

async function listBatches({ fromDate, toDate, status } = {}) {
  try {
    const filter = {};
    const dateRange = normalizeDateRange({ fromDate, toDate });
    if (dateRange) filter.deliveryDate = dateRange;

    if (status && status !== "all") {
      filter.status = status;
    }

    const batches = await DeliveryBatch.find(filter)
      .sort({ deliveryDate: -1, createdAt: -1 })
      .populate({
        path: "routes",
        populate: { path: "driver", select: "name email" },
      })
      .lean();

    const items = batches.map((b) => {
      const routes = Array.isArray(b.routes) ? b.routes : [];
      const distanceKm =
        routes.reduce((sum, r) => sum + (r?.totalDistanceMeters || 0), 0) /
        1000;
      const durationMin =
        routes.reduce((sum, r) => sum + (r?.totalDurationSeconds || 0), 0) / 60;

      return {
        id: b._id,
        deliveryDate: b.deliveryDate,
        status: b.status,
        ordersCount: Array.isArray(b.orders) ? b.orders.length : 0,
        dropsCount: routes.reduce((sum, r) => sum + (r?.totalStops || 0), 0),
        unassignedCount: Math.max(
          0,
          (Array.isArray(b.orders) ? b.orders.length : 0) -
            routes.reduce((sum, r) => sum + (r?.totalStops || 0), 0),
        ),
        distanceKm,
        durationMin,
        lastOptimizedAt: b.generatedAt || null,
      };
    });

    return { success: true, data: { batches: items } };
  } catch (err) {
    console.error("List batches error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to list batches",
    };
  }
}

async function listEligibleOrders({ deliveryDate } = {}) {
  try {
    if (!deliveryDate) {
      return {
        success: false,
        statusCode: 400,
        message: "deliveryDate is required",
      };
    }

    const date = new Date(deliveryDate);
    if (Number.isNaN(date.getTime())) {
      return {
        success: false,
        statusCode: 400,
        message: "Invalid deliveryDate",
      };
    }

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

    const orders = await Order.find({
      deliveryDate: { $gte: startOfDay, $lte: endOfDay },
      status: "paid",
    })
      .populate("customer", "firstName lastName phone")
      .select("orderId deliveryAddress location items")
      .sort({ createdAt: -1 })
      .lean();

    const mapped = orders.map((o) => ({
      id: o._id,
      orderId: o.orderId,
      customerName:
        o.customer && typeof o.customer === "object"
          ? `${o.customer.firstName || ""} ${o.customer.lastName || ""}`.trim()
          : "",
      phone:
        o.customer && typeof o.customer === "object" ? o.customer.phone : null,
      postcode: o.deliveryAddress?.postcode || "",
      addressLine1: o.deliveryAddress?.line1 || "",
      lat: o.location?.lat,
      lng: o.location?.lng,
      totalItems: Array.isArray(o.items)
        ? o.items.reduce((sum, it) => sum + (it?.quantity || 0), 0)
        : 0,
    }));

    return { success: true, data: { orders: mapped } };
  } catch (err) {
    console.error("List eligible orders error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to list eligible orders",
    };
  }
}

async function listDrivers() {
  try {
    const driverRole = await Role.findOne({ name: "driver" }).select("_id");
    if (!driverRole) {
      return { success: true, data: { drivers: [] } };
    }

    const drivers = await User.find({ role: driverRole._id, status: "active" })
      .select("name email")
      .sort({ name: 1 })
      .lean();

    return {
      success: true,
      data: {
        drivers: drivers.map((d) => ({
          id: d._id,
          name: d.name,
          email: d.email,
        })),
      },
    };
  } catch (err) {
    console.error("List drivers error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to list drivers",
    };
  }
}

async function getDepot() {
  const lat = Number(process.env.WAREHOUSE_LAT);
  const lng = Number(process.env.WAREHOUSE_LNG);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return {
      success: false,
      statusCode: 500,
      message: "WAREHOUSE_LAT/WAREHOUSE_LNG are not configured",
    };
  }

  return {
    success: true,
    data: {
      lat,
      lng,
      label: "Depot",
    },
  };
}

async function lockBatch({ batchId } = {}) {
  if (!batchId)
    return { success: false, statusCode: 400, message: "batchId is required" };
  const batch = await DeliveryBatch.findById(batchId);
  if (!batch)
    return { success: false, statusCode: 404, message: "Batch not found" };
  batch.status = "locked";
  batch.lockedAt = new Date();
  await batch.save();
  return {
    success: true,
    data: {
      batchId: batch._id,
      status: batch.status,
      lockedAt: batch.lockedAt,
    },
  };
}

async function unlockBatch({ batchId } = {}) {
  if (!batchId)
    return { success: false, statusCode: 400, message: "batchId is required" };
  const batch = await DeliveryBatch.findById(batchId);
  if (!batch)
    return { success: false, statusCode: 404, message: "Batch not found" };
  batch.status = "collecting";
  batch.lockedAt = null;
  await batch.save();
  return { success: true, data: { batchId: batch._id, status: batch.status } };
}

async function dispatchBatch({ batchId } = {}) {
  if (!batchId)
    return { success: false, statusCode: 400, message: "batchId is required" };
  const batch = await DeliveryBatch.findById(batchId);
  if (!batch)
    return { success: false, statusCode: 404, message: "Batch not found" };
  batch.status = "dispatched";
  batch.dispatchedAt = new Date();
  await batch.save();
  return { success: true, data: { batchId: batch._id, status: batch.status } };
}

async function generateRoutes({ batchId, driverIds, startTime, endTime } = {}) {
  try {
    const result = await generateRoutesForBatch({
      batchId,
      driverIds,
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

/**
 * Delete a delivery batch and cascade-delete associated routes + stops.
 */
async function deleteBatch({ batchId } = {}) {
  try {
    if (!batchId || !mongoose.Types.ObjectId.isValid(String(batchId))) {
      return { success: false, statusCode: 400, message: "Invalid batchId" };
    }

    const existing = await DeliveryBatch.findById(batchId).select("_id").lean();
    if (!existing) {
      return { success: false, statusCode: 404, message: "Batch not found" };
    }

    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const routes = await Route.find({ batch: batchId })
        .select("_id")
        .session(session)
        .lean();

      const routeIds = routes.map((r) => r._id);

      if (routeIds.length > 0) {
        await Stop.deleteMany({ route: { $in: routeIds } }).session(session);
        await Route.deleteMany({ _id: { $in: routeIds } }).session(session);
      }

      await DeliveryBatch.deleteOne({ _id: batchId }).session(session);

      await session.commitTransaction();
      session.endSession();

      return { success: true };
    } catch (err) {
      await session.abortTransaction();
      session.endSession();
      throw err;
    }
  } catch (err) {
    console.error("Delete batch error:", err);
    return {
      success: false,
      statusCode: 500,
      message: "Failed to delete delivery batch",
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
  listBatches,
  listEligibleOrders,
  listDrivers,
  getDepot,
  lockBatch,
  unlockBatch,
  dispatchBatch,
  generateRoutes,
  getBatch,
  getRoute,
  getRouteStock,
  deleteBatch,
};
