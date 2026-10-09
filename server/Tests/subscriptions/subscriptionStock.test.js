"use strict";
const mongoose = require("mongoose");
const Variant = require("../../models/variant.model");
const Reservation = require("../../models/subscriptionStockReservation.model");
const { reserveStock, consumeStock, releaseStock } = require("../../services/subscriptions/subscriptionStock.service");
const { reconcileReservedStock } = require("../../services/orders/orders.stock.service");
const Order = require("../../models/order.model");
const { updateRecurringInventory, saveRefundedOrder } = require("../../services/subscriptions/subscriptionOrderStock.service");
let variant, subscription;
beforeEach(async () => {
  subscription = new mongoose.Types.ObjectId();
  variant = await Variant.create({ product: new mongoose.Types.ObjectId(), name: "Milk",
    sku: `stock-${new mongoose.Types.ObjectId()}`, price: 2, stockQuantity: 1, reservedQuantity: 0, status: "active" });
});
const reserve = key => reserveStock({ key, subscriptionId: subscription, items: [{ variant: variant._id, quantity: 1 }] });
const consume = (key, options = {}) => consumeStock({ key, subscriptionId: subscription, items: [{ variant: variant._id, quantity: 1 }], ...options });

test("concurrent customers cannot reserve the last unit twice", async () => {
  const results = await Promise.allSettled([reserve("customer-a"), reserve("customer-b")]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.find(result => result.status === "rejected").reason.code).toBe("SUBSCRIPTION_OUT_OF_STOCK");
  expect((await Variant.findById(variant._id)).reservedQuantity).toBe(1);
  expect(await Reservation.countDocuments({ state: "held" })).toBe(1);
});
test("payment and fulfillment retries reserve and consume exactly once", async () => {
  await reserve("purchase");
  await reserve("purchase");
  await consume("purchase");
  await consume("purchase");
  const saved = await Variant.findById(variant._id);
  expect(saved.stockQuantity).toBe(0);
  expect(saved.reservedQuantity).toBe(0);
});
test("a failed fulfillment transaction retains its reservation and restores stock", async () => {
  await reserve("purchase");
  await expect(mongoose.connection.transaction(async session => {
    await consume("purchase", { session });
    throw new Error("order write failed");
  })).rejects.toThrow("order write failed");
  expect((await Variant.findById(variant._id)).stockQuantity).toBe(1);
  expect((await Variant.findById(variant._id)).reservedQuantity).toBe(1);
  await consume("purchase");
  expect((await Variant.findById(variant._id)).stockQuantity).toBe(0);
});
test("reconciliation retains unresolved subscription payment holds", async () => {
  await reserve("unknown-payment");
  await reconcileReservedStock();
  expect((await Variant.findById(variant._id)).reservedQuantity).toBe(1);
});
test("a confirmed unpaid decline releases stock and a retry can reserve it again", async () => {
  await reserve("declined");
  await releaseStock({ key: "declined" });
  await releaseStock({ key: "declined" });
  expect((await Variant.findById(variant._id)).reservedQuantity).toBe(0);
  await reserve("declined");
  expect((await Variant.findById(variant._id)).reservedQuantity).toBe(1);
});
test("removing an unfulfilled paid add-on returns consumed stock once", async () => {
  await reserve("detached");
  await consume("detached");
  await releaseStock({ key: "detached", restockConsumed: true });
  await releaseStock({ key: "detached", restockConsumed: true });
  expect((await Variant.findById(variant._id)).stockQuantity).toBe(1);
});
test("duplicate variant inputs are summed and cannot oversell the last unit", async () => {
  await expect(reserveStock({ key: "duplicates", subscriptionId: subscription,
    items: [{ variant: variant._id, quantity: 1 }, { variant: variant._id, quantity: 1 }] }))
    .rejects.toMatchObject({ code: "SUBSCRIPTION_OUT_OF_STOCK" });
  expect((await Variant.findById(variant._id)).reservedQuantity).toBe(0);
});

test("a multi-day reservation consumes each delivery once while retaining the other day's hold", async () => {
  await Variant.updateOne({ _id: variant._id }, { $set: { stockQuantity: 2 } });
  await reserveStock({ key: "multi", subscriptionId: subscription, items: [{ variant: variant._id, quantity: 2 }] });
  await consume("multi", { consumptionKey: "day-one" });
  await consume("multi", { consumptionKey: "day-one" });
  expect((await Variant.findById(variant._id)).toObject()).toMatchObject({ stockQuantity: 1, reservedQuantity: 1 });
  await consume("multi", { consumptionKey: "day-two" });
  expect((await Variant.findById(variant._id)).toObject()).toMatchObject({ stockQuantity: 0, reservedQuantity: 0 });
});
test("a pre-dispatch decrease returns only stock whose original consumption is known", async () => {
  const order = { _id: new mongoose.Types.ObjectId(), subscription, items: [{ variant: variant._id, quantity: 2 }],
    subscriptionStockItems: [{ variant: String(variant._id), quantity: 1 }], subscriptionAddOnStockItems: [] };
  await mongoose.connection.transaction(session => updateRecurringInventory(order, [], { session, operationId: "decrease" }));
  expect((await Variant.findById(variant._id)).stockQuantity).toBe(2);
  expect(order.subscriptionStockItems).toEqual([]);
});
test("cancelling an unfulfilled order restores recurring and add-on stock exactly once", async () => {
  await Variant.updateOne({ _id: variant._id }, { $set: { stockQuantity: 0 } });
  const order = await Order.create({ customer: new mongoose.Types.ObjectId(), subscription, orderType: "subscription_generated",
    items: [{ product: variant.product, variant: variant._id, name: "Milk", sku: variant.sku, price: 2, quantity: 1, subtotal: 2 }],
    deliveryAddress: { line1: "1 Street", city: "London", postcode: "SW1A 1AA", country: "UK" },
    customerInstructions: "", location: { lat: 51, lng: 0 }, deliveryDate: new Date(), subtotal: 2, total: 2,
    amountPaid: 2, status: "paid", deliveryStatus: "ordered", reservationExpiresAt: new Date(),
    subscriptionStockItems: [{ variant: String(variant._id), quantity: 1 }],
    subscriptionAddOnStockItems: [{ variant: String(variant._id), quantity: 1 }] });
  order.status = "refunded";
  await saveRefundedOrder(order);
  await saveRefundedOrder(await Order.findById(order._id));
  expect((await Variant.findById(variant._id)).stockQuantity).toBe(2);
  expect((await Order.findById(order._id)).subscriptionStockToRestore).toHaveLength(2);
});
