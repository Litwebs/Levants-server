"use strict";

const mongoose = require("mongoose");

const Order = require("../../models/order.model");
const DeliveryBatch = require("../../models/deliveryBatch.model");
const Stop = require("../../models/stop.model");
const Route = require("../../models/route.model");
const DiscountRedemption = require("../../models/discountRedemption.model");

const { reconcileReservedStock } = require("../orders.stock.service");
const {
  ACTIVE_ORDER_FILTER,
  buildActiveOrderIdQuery,
} = require("../../utils/ordersAdmin.util");

async function deleteOrderDocument(order) {
  const affectedVariantIds = Array.isArray(order.items)
    ? order.items.map((item) => item.variant).filter(Boolean)
    : [];

  const stops = await Stop.find({ order: order._id }).select("route").lean();
  const routeIds = Array.from(
    new Set(
      stops
        .map((stop) => String(stop.route || ""))
        .filter((id) => mongoose.Types.ObjectId.isValid(id)),
    ),
  ).map((id) => new mongoose.Types.ObjectId(id));

  await Promise.all([
    DeliveryBatch.updateMany(
      { orders: order._id },
      { $pull: { orders: order._id } },
    ),
    Stop.deleteMany({ order: order._id }),
    DiscountRedemption.deleteMany({ order: order._id }),
    Order.updateOne(
      { _id: order._id },
      {
        $set: {
          archived: true,
          archivedAt: new Date(),
        },
      },
    ),
  ]);

  if (affectedVariantIds.length > 0) {
    await reconcileReservedStock({ variantIds: affectedVariantIds });
  }

  if (routeIds.length > 0) {
    await Promise.all(
      routeIds.map(async (routeId) => {
        const totalStops = await Stop.countDocuments({ route: routeId });
        await Route.updateOne({ _id: routeId }, { $set: { totalStops } });
      }),
    );
  }
}

async function DeleteOrder({ orderId } = {}) {
  if (!orderId) {
    return { success: false, statusCode: 400, message: "orderId is required" };
  }

  const order = await Order.findOne(buildActiveOrderIdQuery(orderId)).select(
    "_id items",
  );
  if (!order) {
    return { success: false, statusCode: 404, message: "Order not found" };
  }

  await deleteOrderDocument(order);

  return {
    success: true,
    data: {
      deleted: true,
      orderId: String(order._id),
    },
  };
}

async function BulkDeleteOrders({ orderIds } = {}) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) {
    return { success: false, statusCode: 400, message: "orderIds required" };
  }

  const ids = orderIds
    .map((id) => String(id))
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

  if (!ids.length) {
    return {
      success: false,
      statusCode: 400,
      message: "No valid orderIds provided",
    };
  }

  const orders = await Order.find({
    _id: { $in: ids },
    ...ACTIVE_ORDER_FILTER,
  }).select("_id items");

  for (const order of orders) {
    await deleteOrderDocument(order);
  }

  return {
    success: true,
    data: {
      matched: ids.length,
      deleted: orders.length,
    },
  };
}

module.exports = {
  DeleteOrder,
  BulkDeleteOrders,
};
