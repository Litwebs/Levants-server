"use strict";
const mongoose = require("mongoose");
const Delivery = require("../../models/subscriptionDelivery.model");
const { formatDateKeyInTimeZone, SUBSCRIPTION_TIME_ZONE } = require("../../utils/subscriptionCutoff.util");
const id = value => String(value?._id || value || "");
const day = value => formatDateKeyInTimeZone(value, SUBSCRIPTION_TIME_ZONE);
const key = (orderId, subscriptionId, date) => [id(orderId), id(subscriptionId), day(date)].join(":");
async function presentCancelledSubscriptionOrders(orders) {
  const candidates = orders.filter(order => order.status === "refunded" && order.deliveryStatus === "ordered" &&
    mongoose.Types.ObjectId.isValid(id(order._id)) && mongoose.Types.ObjectId.isValid(id(order.subscription)) &&
    order.deliveryDate && Number.isFinite(new Date(order.deliveryDate).getTime()));
  if (!candidates.length) return orders;
  const slots = await Delivery.find({ status: "cancelled", $or: candidates.map(order =>
    ({ order: order._id, subscription: order.subscription?._id || order.subscription })) })
    .select("order subscription scheduledDate").lean();
  const cancelled = new Set(slots.filter(slot => slot.scheduledDate && Number.isFinite(new Date(slot.scheduledDate).getTime()))
    .map(slot => key(slot.order, slot.subscription, slot.scheduledDate)));
  return orders.map(order => {
    if (!candidates.includes(order) || !cancelled.has(key(order._id, order.subscription, order.deliveryDate))) return order;
    // Read-only compatibility for older cancellations; never rewrite stock,
    // payment, order or slot records to repair their historical representation.
    const plain = typeof order.toJSON === "function" ? order.toJSON() : order;
    return { ...plain, deliveryStatus: "cancelled", portalDeliveryStatus: "cancelled" };
  });
}
module.exports = { presentCancelledSubscriptionOrders };
