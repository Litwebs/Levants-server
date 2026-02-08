// src/services/orders.expiration.service.js
const Order = require("../models/order.model");
const { releaseReservedStock } = require("./orders.stock.service");

async function expireStaleOrders() {
  const now = new Date();

  const expiredOrders = await Order.find({
    status: "pending",
    reservationExpiresAt: { $lte: now },
  }).select("_id");

  for (const order of expiredOrders) {
    try {
      await releaseReservedStock(order._id, "cancelled");
    } catch (err) {
      console.error("Failed to expire order", order._id, err);
    }
  }
}

module.exports = {
  expireStaleOrders,
};
