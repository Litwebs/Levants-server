"use strict";
const mongoose = require("mongoose");
const { createPortalCustomer } = require("../portal/helpers");
const Subscription = require("../../models/subscription.model");
const Delivery = require("../../models/subscriptionDelivery.model");
const Order = require("../../models/order.model");
const Customer = require("../../models/customer.model");
const stripe = require("../../utils/stripe.util");
const { withLease } = require("../../utils/subscriptionLease.util");
const Batch = require("../../models/deliveryBatch.model");
const Route = require("../../models/route.model");
const Stop = require("../../models/stop.model");
const { dispatchBatch, dispatchRoute } = require("../../services/delivery/delivery.dispatch.service");

let customer, subscription;
beforeEach(async () => {
  ({ customer } = await createPortalCustomer());
  const id = () => new mongoose.Types.ObjectId();
  subscription = await Subscription.create({ customer: customer._id, frequency: "weekly",
    preferredDeliveryDay: 0, startDate: new Date(), deliveryAddress: customer.addresses[0].toObject(),
    items: [{ product: id(), variant: id(), name: "Milk", sku: "milk", quantity: 1, unitPrice: 2 }],
    customerMutationLock: { operationId: "worker-a", lockedAt: new Date() } });
});
const slot = () => ({ subscription: subscription._id, customer: customer._id,
  scheduledDate: new Date("2030-01-06T09:00:00Z") });
const run = (token, execute) => withLease({ kind: "subscription", id: subscription._id, token }, execute);

test("a takeover fences a paused worker's stale subscription and delivery writes", async () => {
  const stale = await Subscription.findById(subscription._id);
  stale.notes = "stale overwrite";
  await Subscription.collection.updateOne({ _id: subscription._id },
    { $set: { "customerMutationLock.lockedAt": new Date(0) } });
  const takeover = await Subscription.findOneAndUpdate({ _id: subscription._id,
    "customerMutationLock.lockedAt": { $lt: new Date(Date.now() - 120000) } },
  { $set: { customerMutationLock: { operationId: "worker-b", lockedAt: new Date() } } });
  expect(takeover).not.toBeNull();
  await run("worker-b", () => Subscription.updateOne({ _id: subscription._id }, { $set: { notes: "new owner" } }));
  await expect(run("worker-a", () => stale.save())).rejects.toMatchObject({ code: "SUBSCRIPTION_LEASE_LOST" });
  await expect(run("worker-a", () => Delivery.create(slot()))).rejects.toMatchObject({ code: "SUBSCRIPTION_LEASE_LOST" });
  expect((await Subscription.findById(subscription._id)).notes).toBe("new owner");
  expect(await Delivery.countDocuments({ subscription: subscription._id })).toBe(0);
});

test("an expired lease cannot write even before a replacement worker arrives", async () => {
  await Subscription.collection.updateOne({ _id: subscription._id },
    { $set: { "customerMutationLock.lockedAt": new Date(0) } });
  await expect(run("worker-a", () => Delivery.updateMany({ subscription: subscription._id },
    { $set: { status: "cancelled" } }))).rejects.toMatchObject({ code: "SUBSCRIPTION_LEASE_LOST" });
});

test("the fence shares explicit transactions and rolls back with their writes", async () => {
  await expect(run("worker-a", () => mongoose.connection.transaction(async session => {
    await Delivery.create([slot()], { session });
    await Subscription.updateOne({ _id: subscription._id }, { $set: { notes: "rollback" } }, { session });
    throw new Error("later write failed");
  }))).rejects.toThrow("later write failed");
  expect(await Delivery.countDocuments({ subscription: subscription._id })).toBe(0);
  expect((await Subscription.findById(subscription._id)).notes).not.toBe("rollback");
  const delivery = await run("worker-a", () => Delivery.create(slot()));
  expect(delivery.$session()).toBeNull();
});

test("an old transaction snapshot cannot evade a takeover", async () => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    await Subscription.findById(subscription._id).session(session);
    await Subscription.collection.updateOne({ _id: subscription._id },
      { $set: { customerMutationLock: { operationId: "worker-b", lockedAt: new Date() } } });
    await expect(run("worker-a", () => Delivery.create([slot()], { session }))).rejects.toThrow();
    await session.abortTransaction();
    expect(await Delivery.countDocuments({ subscription: subscription._id })).toBe(0);
  } finally { await session.endSession(); }
});

test("customer creation and card checkpoints are fenced by the customer lease", async () => {
  await Customer.updateOne({ _id: customer._id }, { $set: {
    paymentMethodLock: { token: "customer-b", expiresAt: new Date(Date.now() + 120000) } } });
  await expect(withLease({ kind: "customer", id: customer._id, token: "customer-a" },
    () => Customer.updateOne({ _id: customer._id }, { $set: { paymentMethodOperation: { id: "stale" } } })))
    .rejects.toMatchObject({ code: "SUBSCRIPTION_LEASE_LOST" });
  expect((await Customer.findById(customer._id).select("+paymentMethodOperation")).paymentMethodOperation).toBeNull();
});

test("a stale worker cannot send a new provider refund command", async () => {
  await Subscription.collection.updateOne({ _id: subscription._id },
    { $set: { customerMutationLock: { operationId: "worker-b", lockedAt: new Date() } } });
  stripe.refunds.create.mockClear();
  await expect(run("worker-a", () => stripe.refunds.create({ payment_intent: "pi", amount: 200 })))
    .rejects.toMatchObject({ code: "SUBSCRIPTION_LEASE_LOST" });
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});

test("dispatch cannot commit across a live subscription payment lease", async () => {
  const order = await Order.create({ customer: customer._id, subscription: subscription._id,
    orderType: "subscription_generated", deliveryAddress: customer.addresses[0].toObject(),
    customerInstructions: "", location: { lat: 51, lng: 0 }, deliveryDate: new Date(), deliveryStatus: "ordered",
    items: [{ product: new mongoose.Types.ObjectId(), variant: new mongoose.Types.ObjectId(), name: "Milk", sku: "milk", price: 2, quantity: 1, subtotal: 2 }],
    subtotal: 2, total: 2, amountPaid: 2, status: "paid", reservationExpiresAt: new Date() });
  await expect(Order.updateMany({ _id: order._id }, { $set: { deliveryStatus: "dispatched" } }))
    .rejects.toMatchObject({ code: "SUBSCRIPTION_DELIVERY_BUSY" });
  expect((await Order.findById(order._id)).deliveryStatus).toBe("ordered");
  await Subscription.collection.updateOne({ _id: subscription._id }, { $unset: { customerMutationLock: 1 } });
  await Order.updateMany({ _id: order._id }, { $set: { deliveryStatus: "dispatched" } });
  expect((await Order.findById(order._id)).deliveryStatus).toBe("dispatched");
});

test.each(["batch", "route"])("a busy subscription rolls back the entire %s dispatch", async mode => {
  const order = await Order.create({ customer: customer._id, subscription: subscription._id,
    orderType: "subscription_generated", deliveryAddress: customer.addresses[0].toObject(),
    customerInstructions: "", location: { lat: 51, lng: 0 }, deliveryDate: new Date(), deliveryStatus: "ordered",
    items: [{ product: new mongoose.Types.ObjectId(), variant: new mongoose.Types.ObjectId(), name: "Milk", sku: "milk", price: 2, quantity: 1, subtotal: 2 }],
    subtotal: 2, total: 2, amountPaid: 2, status: "paid", reservationExpiresAt: new Date() });
  const batch = await Batch.create({ deliveryDate: new Date(), status: "routes_generated", orders: [order._id] });
  const route = await Route.create({ batch: batch._id, driver: new mongoose.Types.ObjectId(), status: "planned" });
  batch.routes = [route._id]; await batch.save();
  await Stop.create({ route: route._id, order: order._id, sequence: 1 });
  const dispatch = mode === "batch" ? () => dispatchBatch({ batchId: batch._id }) :
    () => dispatchRoute({ batchId: batch._id, routeId: route._id });
  await expect(dispatch()).rejects.toMatchObject({ code: "SUBSCRIPTION_DELIVERY_BUSY" });
  expect((await Order.findById(order._id)).deliveryStatus).toBe("ordered");
  expect((await Batch.findById(batch._id)).status).toBe("routes_generated");
  expect((await Batch.findById(batch._id)).dispatchedAt).toBeUndefined();
  expect((await Route.findById(route._id)).status).toBe("planned");
});
