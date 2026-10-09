"use strict";
const mongoose = require("mongoose");
const Variant = require("../../models/variant.model");
const { consumeStock } = require("./subscriptionStock.service");
function totals(items) {
  const map = new Map();
  for (const item of items || []) map.set(String(item.variant), (map.get(String(item.variant)) || 0) + Number(item.quantity));
  return map;
}
function recordConsumed(order, items, { addOn = false } = {}) {
  const field = addOn ? "subscriptionAddOnStockItems" : "subscriptionStockItems";
  const tracked = totals(order[field]);
  for (const [variant, quantity] of totals(items)) tracked.set(variant, (tracked.get(variant) || 0) + quantity);
  order[field] = [...tracked].map(([variant, quantity]) => ({ variant, quantity }));
}
async function updateRecurringInventory(order, items, { operationId, session, inventoryAlreadyConsumed = false } = {}) {
  const before = totals(order.items.filter(item => !item.isSubscriptionAddOn));
  const after = totals(items);
  const tracked = totals(order.subscriptionStockItems);
  const additions = [];
  for (const variant of new Set([...before.keys(), ...after.keys()])) {
    const delta = (after.get(variant) || 0) - (before.get(variant) || 0);
    if (delta > 0) additions.push({ variant, quantity: delta });
    if (delta < 0) {
      // Never return legacy units whose original consumption is unproven.
      const quantity = Math.min(-delta, tracked.get(variant) || 0);
      if (quantity) {
        const restored = await Variant.updateOne({ _id: variant }, { $inc: { stockQuantity: quantity } }, { session });
        if (!restored.matchedCount) throw new Error("The changed order's inventory needs reconciliation.");
        tracked.set(variant, tracked.get(variant) - quantity);
      }
    }
  }
  order.subscriptionStockItems = [...tracked].filter(([, quantity]) => quantity > 0).map(([variant, quantity]) => ({ variant, quantity }));
  if (additions.length) {
    if (!inventoryAlreadyConsumed) {
      // Without a request ID, each committed transition needs its own key:
      // A -> B -> A -> B must consume B again. Stock and order still commit
      // together, so a failed transaction cannot leave this key consumed.
      const transitionId = operationId || require("crypto").randomUUID();
      await consumeStock({ key: `subscription-order-edit:${order._id}:${transitionId}`,
        subscriptionId: order.subscription, items: additions, session });
    }
    recordConsumed(order, additions);
  }
}
async function saveRefundedOrder(order) {
  if (!order.subscriptionStockItems?.length && !order.subscriptionAddOnStockItems?.length) return order.save();
  return mongoose.connection.transaction(async session => {
    const fresh = await order.constructor.findById(order._id).session(session);
    if (!fresh || fresh.deliveryStatus !== "ordered") throw new Error("The refunded delivery's stock needs reconciliation before cancellation.");
    const restore = [...fresh.subscriptionStockItems.map(item => ({ ...item, isSubscriptionAddOn: false })),
      ...fresh.subscriptionAddOnStockItems.map(item => ({ ...item, isSubscriptionAddOn: true }))];
    for (const [variant, quantity] of totals(restore)) {
      const restored = await Variant.updateOne({ _id: variant }, { $inc: { stockQuantity: quantity } }, { session });
      if (!restored.matchedCount) throw new Error("The refunded delivery's stock variant is missing.");
    }
    fresh.subscriptionStockItems = [];
    fresh.subscriptionAddOnStockItems = [];
    fresh.subscriptionStockToRestore = restore;
    fresh.status = order.status;
    fresh.refund = order.refund;
    await fresh.save({ session });
    order.subscriptionStockItems = [];
    order.subscriptionAddOnStockItems = [];
    order.subscriptionStockToRestore = restore;
    return fresh;
  });
}
module.exports = { updateRecurringInventory, recordConsumed, saveRefundedOrder };
