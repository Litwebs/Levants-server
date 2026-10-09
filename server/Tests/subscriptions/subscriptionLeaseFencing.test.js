"use strict";
const mongoose = require("mongoose");
const { createPortalCustomer } = require("../portal/helpers");
const Subscription = require("../../models/subscription.model");
const Delivery = require("../../models/subscriptionDelivery.model");
const Customer = require("../../models/customer.model");
const stripe = require("../../utils/stripe.util");
const { withLease } = require("../../utils/subscriptionLease.util");

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
