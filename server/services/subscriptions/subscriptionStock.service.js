"use strict";
const mongoose = require("mongoose");
const Reservation = require("../../models/subscriptionStockReservation.model");
const Variant = require("../../models/variant.model");

function stockItems(items) {
  const totals = new Map();
  for (const item of items) {
    const variant = String(item.variant || item.variantId);
    const quantity = Number(item.quantity);
    if (!mongoose.Types.ObjectId.isValid(variant) || !Number.isSafeInteger(quantity) || quantity <= 0) {
      throw new Error("Invalid subscription inventory quantity");
    }
    totals.set(variant, (totals.get(variant) || 0) + quantity);
  }
  return [...totals].sort(([left], [right]) => left.localeCompare(right))
    .map(([variant, quantity]) => ({ variant, quantity }));
}
function unavailable() {
  return Object.assign(new Error("Not enough stock is available for this subscription delivery. No new payment was started."),
    { code: "SUBSCRIPTION_OUT_OF_STOCK" });
}
function transaction(session, execute) {
  return session ? execute(session) : mongoose.connection.transaction(execute);
}
async function reserveStock({ key, subscriptionId, items, session }) {
  const quantities = stockItems(items);
  return transaction(session, async currentSession => {
    const existing = await Reservation.findOne({ key }).session(currentSession);
    if (existing && JSON.stringify(existing.items) !== JSON.stringify(quantities)) throw new Error("Retry the original inventory reservation.");
    if (existing && existing.state !== "released") return existing;
    for (const item of quantities) {
      const reserved = await Variant.updateOne({ _id: item.variant, status: "active", $expr: { $gte: [
        { $subtract: ["$stockQuantity", { $ifNull: ["$reservedQuantity", 0] }] }, item.quantity,
      ] } }, { $inc: { reservedQuantity: item.quantity } }, { session: currentSession });
      if (!reserved.matchedCount) throw unavailable();
    }
    return Reservation.findOneAndUpdate({ key }, { $set: { subscription: subscriptionId,
      state: "held", items: quantities, remaining: quantities, consumptions: [] } },
    { upsert: true, new: true, session: currentSession });
  });
}

async function consumeStock({ key, subscriptionId, items, consumptionKey = key, session }) {
  const quantities = stockItems(items);
  return transaction(session, async currentSession => {
    let reservation = await Reservation.findOne({ key }).session(currentSession);
    if (reservation?.consumptions.some(entry => entry.key === consumptionKey)) return;
    if (reservation?.state === "released") throw new Error("The inventory reservation was released; reconcile its original payment.");
    const held = Boolean(reservation);
    const remaining = new Map((reservation?.remaining || []).map(item => [item.variant, item.quantity]));
    for (const item of quantities) {
      if (held && (remaining.get(item.variant) || 0) < item.quantity) throw new Error("The paid delivery exceeds its reserved inventory.");
      const used = await Variant.updateOne({ _id: item.variant,
        ...(held ? { stockQuantity: { $gte: item.quantity }, reservedQuantity: { $gte: item.quantity } }
          : { status: "active", $expr: { $gte: [
              { $subtract: ["$stockQuantity", { $ifNull: ["$reservedQuantity", 0] }] }, item.quantity,
            ] } }),
      }, { $inc: { stockQuantity: -item.quantity, ...(held ? { reservedQuantity: -item.quantity } : {}) } },
      { session: currentSession });
      if (!used.matchedCount) throw unavailable();
      if (held) remaining.set(item.variant, remaining.get(item.variant) - item.quantity);
    }
    const nextRemaining = [...remaining].filter(([, quantity]) => quantity > 0).map(([variant, quantity]) => ({ variant, quantity }));
    if (!reservation) {
      [reservation] = await Reservation.create([{ key, subscription: subscriptionId,
        state: "consumed", items: quantities, remaining: [], consumptions: [{ key: consumptionKey, items: quantities }] }],
      { session: currentSession });
    } else {
      reservation.remaining = nextRemaining;
      reservation.state = nextRemaining.length ? "held" : "consumed";
      reservation.consumptions.push({ key: consumptionKey, items: quantities });
      await reservation.save({ session: currentSession });
    }
  });
}

async function releaseStock({ key, restockConsumed = false, session }) {
  return transaction(session, async currentSession => {
    const reservation = await Reservation.findOne({ key }).session(currentSession);
    if (!reservation || reservation.state === "released") return;
    for (const item of reservation.remaining) {
      const released = await Variant.updateOne({ _id: item.variant, reservedQuantity: { $gte: item.quantity } },
        { $inc: { reservedQuantity: -item.quantity } }, { session: currentSession });
      if (!released.matchedCount) throw new Error("Reserved inventory needs reconciliation before release.");
    }
    if (restockConsumed) {
      for (const entry of reservation.consumptions) for (const item of entry.items) {
        const restored = await Variant.updateOne({ _id: item.variant }, { $inc: { stockQuantity: item.quantity } }, { session: currentSession });
        if (!restored.matchedCount) throw new Error("Consumed inventory needs reconciliation before restocking.");
      }
    }
    reservation.remaining = [];
    reservation.state = "released";
    await reservation.save({ session: currentSession });
  });
}
module.exports = { reserveStock, consumeStock, releaseStock, stockItems };
