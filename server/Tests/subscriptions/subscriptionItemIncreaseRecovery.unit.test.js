"use strict";

jest.mock("../../utils/stripe.util", () => ({ paymentIntents: { create: jest.fn(), retrieve: jest.fn() } }));
jest.mock("../../services/customerPortal/subscriptionEmailNotifications.service", () => ({ sendSubscriptionUpdateEmail: jest.fn(async () => {}) }));
const mongoose = require("mongoose");
const Subscription = require("../../models/subscription.model");
const Mutation = require("../../models/subscriptionMutation.model");
const Order = require("../../models/order.model");
const stripe = require("../../utils/stripe.util");
const { RecoverSubscriptionItemIncrease: recover } = require("../../services/customerPortal/customerSubscriptions.service");

let mutation, session, updated;
beforeEach(() => {
  mutation = { _id: "m", customer: "c", subscription: "s", operationId: "op", status: "failed",
    itemIncreaseSnapshot: { startedAt: new Date(), baseVersion: 2, fields: { items: [] },
      orderEdits: [], amountMinor: 250, chargeParams: { customer: "cus", currency: "gbp", amount: 250, payment_method: "pm_original" } } };
  updated = { _id: "s", toObject: () => ({ _id: "s", customerVersion: 3 }) };
  session = { withTransaction: jest.fn(async fn => fn()), endSession: jest.fn(async () => {}) };
  jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
  jest.spyOn(Mutation, "findOne").mockImplementation(async () => mutation);
  jest.spyOn(Mutation, "updateOne").mockImplementation(async (_q, update) => {
    if (update.$set["itemIncreaseSnapshot.paymentIntent"]) mutation.itemIncreaseSnapshot.paymentIntent = update.$set["itemIncreaseSnapshot.paymentIntent"];
    return { matchedCount: 1 };
  });
  jest.spyOn(Subscription, "findOneAndUpdate").mockImplementation(async () => updated);
  stripe.paymentIntents.create.mockReset().mockResolvedValue({ id: "pi_saved", status: "succeeded", customer: "cus", currency: "gbp", amount_received: 250 });
});
afterEach(() => jest.restoreAllMocks());
const run = () => recover({ customerId: "c", subscriptionId: "s", operationId: "op" });

it("uses frozen Stripe parameters and commits replay response in the same transaction", async () => {
  expect((await run()).success).toBe(true);
  expect(stripe.paymentIntents.create).toHaveBeenCalledWith({ customer: "cus", currency: "gbp", amount: 250, payment_method: "pm_original" }, { idempotencyKey: "subscription:s:mutation:op:charge" });
  expect(Subscription.findOneAndUpdate.mock.calls[0][0]).toMatchObject({ customerVersion: 2 });
  expect(Subscription.findOneAndUpdate.mock.calls[0][2].session).toBe(session);
  expect(Mutation.updateOne.mock.calls.at(-1)[2].session).toBe(session);
});

it("does not charge again after a local failure with a recorded payment", async () => {
  Subscription.findOneAndUpdate.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(run()).rejects.toThrow("database unavailable");
  expect((await run()).success).toBe(true);
  expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
  expect(session.endSession).toHaveBeenCalledTimes(2);
});

it("retries an ambiguous Stripe response with exactly the same key and parameters", async () => {
  stripe.paymentIntents.create.mockRejectedValueOnce(new Error("response lost"));
  expect((await run()).success).toBe(false);
  expect((await run()).success).toBe(true);
  expect(stripe.paymentIntents.create.mock.calls[1]).toEqual(stripe.paymentIntents.create.mock.calls[0]);
});

it("refuses an expired ambiguous payment attempt", async () => {
  mutation.itemIncreaseSnapshot.startedAt = new Date(Date.now() - 24 * 3600000);
  expect((await run()).data.reconciliationRequired).toBe(true);
  expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
});

it("recovers a known paid attempt even after the idempotency retention window", async () => {
  mutation.itemIncreaseSnapshot.startedAt = new Date(0);
  mutation.itemIncreaseSnapshot.paymentIntent = { id: "pi_known", status: "succeeded", customer: "cus", currency: "gbp", amount_received: 250 };
  expect((await run()).success).toBe(true);
  expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
});

it("never fulfills an unconfirmed payment", async () => {
  stripe.paymentIntents.create.mockResolvedValue({ id: "pi_pending", status: "processing" });
  expect((await run()).success).toBe(false);
  expect(Subscription.findOneAndUpdate).not.toHaveBeenCalled();
});

it("does not complete a payment against a missing fulfillment target", async () => {
  mutation.itemIncreaseSnapshot.orderEdits = [{ orderId: "o", items: [], chargedMinor: 250 }];
  const query = { sort() { return this; }, session() { return this; }, exec: async () => null };
  jest.spyOn(Order, "findOne").mockReturnValue(query);
  await expect(run()).rejects.toThrow("delivery order is no longer editable");
  expect(Mutation.updateOne.mock.calls.some(([, update]) => update.$set.status === "completed")).toBe(false);
});


it("recovers a processing payment by retrieving the same intent", async () => {
  stripe.paymentIntents.create.mockResolvedValueOnce({ id: "pi_processing", status: "processing" });
  expect((await run()).success).toBe(false);
  stripe.paymentIntents.retrieve.mockResolvedValueOnce({ id: "pi_processing", status: "succeeded", customer: "cus", currency: "gbp", amount_received: 250 });
  expect((await run()).success).toBe(true);
  expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith("pi_processing");
  expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
});

it("releases a definitively declined attempt so a replacement card can be used", async () => {
  stripe.paymentIntents.create.mockRejectedValueOnce(Object.assign(new Error("declined"), {
    type: "StripeCardError", payment_intent: { status: "requires_payment_method" },
  }));
  expect((await run()).success).toBe(false);
  expect(Mutation.updateOne).toHaveBeenCalledWith({ _id: "m" }, { $set: { itemIncreaseSnapshot: null } });
  expect(Subscription.findOneAndUpdate).not.toHaveBeenCalled();
});

it.each([{ customer: "foreign" }, { currency: "usd" }, { amount_received: 249 }])(
  "rejects a successful item payment that differs from the saved purchase: %j", async mismatch => {
    stripe.paymentIntents.create.mockResolvedValueOnce({ id: "pi_wrong", status: "succeeded",
      customer: "cus", currency: "gbp", amount_received: 250, ...mismatch });
    expect((await run()).data.reconciliationRequired).toBe(true);
    expect(Subscription.findOneAndUpdate).not.toHaveBeenCalled();
  });
