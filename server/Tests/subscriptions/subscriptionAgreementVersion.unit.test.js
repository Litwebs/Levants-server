"use strict";
const mongoose = require("mongoose");
const Subscription = require("../../models/subscription.model");
const original = new Date("2026-10-01T10:00:00Z");
afterEach(() => jest.restoreAllMocks());
test.each([
  ["payment pause", doc => { doc.status = "paused"; doc.pauseReason = "payment_failed"; doc.pausedAt = new Date(); }],
  ["customer pause", doc => { doc.status = "paused"; doc.pauseReason = "customer"; }],
  ["notes", doc => { doc.notes = "Leave at door"; }],
])("%s retains the invoice agreement while advancing the edit version", async (_name, change) => {
  jest.spyOn(Subscription.collection, "updateOne").mockResolvedValue({ matchedCount: 1 });
  const doc = Subscription.hydrate({ _id: new mongoose.Types.ObjectId(), customer: new mongoose.Types.ObjectId(),
    status: "active", customerVersion: 3, billingStateUpdatedAt: original, notes: null });
  change(doc);
  await doc.save({ validateBeforeSave: false });
  expect(doc.customerVersion).toBe(4);
  expect(doc.billingStateUpdatedAt).toEqual(original);
});
test("a changed delivery schedule invalidates an unfrozen old agreement", async () => {
  jest.spyOn(Subscription.collection, "updateOne").mockResolvedValue({ matchedCount: 1 });
  const doc = Subscription.hydrate({ _id: new mongoose.Types.ObjectId(), customer: new mongoose.Types.ObjectId(),
    frequency: "weekly", customerVersion: 3, billingStateUpdatedAt: original });
  doc.frequency = "monthly";
  await doc.save({ validateBeforeSave: false });
  expect(doc.customerVersion).toBe(4);
  expect(doc.billingStateUpdatedAt.getTime()).toBeGreaterThan(original.getTime());
});
