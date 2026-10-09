"use strict";
const mongoose = require("mongoose");
const Subscription = require("../../models/subscription.model");
const Delivery = require("../../models/subscriptionDelivery.model");
const { withLease } = require("../../utils/subscriptionLease.util");
let session;
beforeEach(() => {
  session = { active: false, startTransaction: jest.fn(function () { this.active = true; }),
    inTransaction() { return this.active; }, commitTransaction: jest.fn(async function () { this.active = false; }),
    abortTransaction: jest.fn(async function () { this.active = false; }), endSession: jest.fn(async () => {}) };
  jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
  jest.spyOn(Subscription.collection, "updateOne").mockResolvedValue({ matchedCount: 1 });
  jest.spyOn(Delivery.collection, "insertOne").mockResolvedValue({ acknowledged: true });
});
afterEach(() => jest.restoreAllMocks());
function run(execute) { return withLease({ kind: "subscription", id: new mongoose.Types.ObjectId(), token: "owner" }, execute); }
function doc() { return new Delivery({ customer: new mongoose.Types.ObjectId(), subscription: new mongoose.Types.ObjectId(), scheduledDate: new Date() }); }
test("a real Mongoose save sends its fenced session to the actual collection write", async () => {
  const delivery = doc();
  await run(() => delivery.save());
  expect(Subscription.collection.updateOne.mock.calls[0][2].session).toBe(session);
  expect(Delivery.collection.insertOne.mock.calls[0][1].session).toBe(session);
  expect(session.commitTransaction).toHaveBeenCalledTimes(1);
  expect(delivery.$session()).toBeNull();
});
test("a rejected fence is caught by save and aborts without an insert", async () => {
  Subscription.collection.updateOne.mockResolvedValue({ matchedCount: 0 });
  await expect(run(() => doc().save())).rejects.toMatchObject({ code: "SUBSCRIPTION_LEASE_LOST" });
  expect(Delivery.collection.insertOne).not.toHaveBeenCalled();
  expect(session.abortTransaction).toHaveBeenCalledTimes(1);
});
test("a failed document write is caught and its short transaction aborts", async () => {
  Delivery.collection.insertOne.mockRejectedValueOnce(new Error("write failed"));
  await expect(run(() => doc().save())).rejects.toThrow("write failed");
  expect(session.abortTransaction).toHaveBeenCalledTimes(1);
});
