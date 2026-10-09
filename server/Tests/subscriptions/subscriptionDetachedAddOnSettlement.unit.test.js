"use strict";
jest.mock("../../utils/stripe.util", () => ({ paymentIntents: { retrieve: jest.fn() },
  refunds: { list: jest.fn(), create: jest.fn(), retrieve: jest.fn() } }));
jest.mock("../../services/storeCredit.service", () => ({ addCredit: jest.fn() }));
const mongoose = require("mongoose");
const Mutation = require("../../models/subscriptionMutation.model");
const Delivery = require("../../models/subscriptionDelivery.model");
const Payment = require("../../models/payment.model");
const stripe = require("../../utils/stripe.util");
const credit = require("../../services/storeCredit.service");
const { settleDetachedAddOns: settle } = require("../../services/customerPortal/subscriptionDetachedAddOnSettlement.service");
let subscription, delivery, mutation;
beforeEach(() => {
  jest.clearAllMocks();
  subscription = { _id: "s", customer: "c", subscriptionNumber: "SUB" };
  delivery = { _id: "d", order: null, addOns: [{ operationId: "op", amountMinor: 250, stripePaymentIntentId: "pi" }] };
  mutation = { _id: "m", operationId: "op", addOnSnapshot: { deliveryId: "d", amountMinor: 250,
    paymentIntent: { id: "pi", status: "succeeded" }, chargeParams: { customer: "cus", currency: "gbp" } } };
  jest.spyOn(Mutation, "findOne").mockResolvedValue(mutation);
  jest.spyOn(Mutation, "updateOne").mockResolvedValue({ matchedCount: 1 });
  jest.spyOn(Delivery, "updateOne").mockResolvedValue({ matchedCount: 1 });
  jest.spyOn(Payment, "updateOne").mockResolvedValue({ matchedCount: 1 });
  jest.spyOn(mongoose.connection, "transaction").mockImplementation(fn => fn("session"));
  stripe.paymentIntents.retrieve.mockResolvedValue({ id: "pi", status: "succeeded", customer: "cus", currency: "gbp", amount_received: 250 });
  stripe.refunds.list.mockResolvedValue({ data: [], has_more: false });
  stripe.refunds.create.mockResolvedValue({ id: "re", amount: 250, status: "succeeded" });
  credit.addCredit.mockResolvedValue({ ok: true });
});
afterEach(() => jest.restoreAllMocks());
const run = method => settle({ subscription, deliveries: [delivery], refundMethod: method });
test("linked add-ons belong to their order settlement", async () => {
  delivery.order = "order";
  await expect(run("refund")).resolves.toEqual({ creditedMinor: 0, refundedMinor: 0 });
  expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
});
test.each(["refund", "credit"])("persists a %s plan before returning value and commits all local checkpoints together", async method => {
  await expect(run(method)).resolves.toEqual({ creditedMinor: method === "credit" ? 250 : 0, refundedMinor: method === "refund" ? 250 : 0 });
  const move = method === "credit" ? credit.addCredit : stripe.refunds.create;
  expect(Mutation.updateOne.mock.invocationCallOrder[0]).toBeLessThan(move.mock.invocationCallOrder[0]);
  expect(Delivery.updateOne).toHaveBeenCalledWith(expect.objectContaining({ order: null }), expect.any(Object), { session: "session" });
  expect(Payment.updateOne).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ $set: expect.objectContaining({ status: "refunded" }) }), { session: "session" });
});
test("a failed plan checkpoint prevents both refund and credit", async () => {
  Mutation.updateOne.mockResolvedValueOnce({ matchedCount: 0 });
  await expect(run("refund")).rejects.toThrow("plan could not be saved");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
  expect(credit.addCredit).not.toHaveBeenCalled();
});
test.each([{ customer: "another" }, { amount_received: 251 }, { currency: "usd" }])("rejects a provider payment mismatch: %j", async change => {
  stripe.paymentIntents.retrieve.mockResolvedValue({ id: "pi", status: "succeeded", customer: "cus", currency: "gbp", amount_received: 250, ...change });
  await expect(run("refund")).rejects.toThrow("does not match");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
test("an external refund prevents adding store credit", async () => {
  stripe.refunds.list.mockResolvedValue({ data: [{ id: "external", amount: 100, status: "pending" }] });
  await expect(run("credit")).rejects.toThrow("external refund");
  expect(credit.addCredit).not.toHaveBeenCalled();
});
test("retries an accepted refund by its ID after the retention window", async () => {
  mutation.addOnSnapshot.settlement = { kind: "refund", amountMinor: 250, startedAt: new Date(0), refund: { id: "re" } };
  stripe.refunds.retrieve.mockResolvedValue({ id: "re", amount: 250, status: "succeeded" });
  await expect(run("refund")).resolves.toEqual({ refundedMinor: 250, creditedMinor: 0 });
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
test("a pending refund cannot remove fulfillment or switch to credit", async () => {
  mutation.addOnSnapshot.settlement = { kind: "refund", amountMinor: 250, refund: { id: "re" } };
  await expect(run("credit")).rejects.toThrow("original refund method");
  stripe.refunds.retrieve.mockResolvedValue({ id: "re", amount: 250, status: "pending" });
  await expect(run("refund")).rejects.toThrow("not yet confirmed");
  expect(Delivery.updateOne).not.toHaveBeenCalled();
  expect(credit.addCredit).not.toHaveBeenCalled();
});
test("an aged ambiguous refund is never recreated after its key could expire", async () => {
  mutation.addOnSnapshot.settlement = { kind: "refund", amountMinor: 250, startedAt: new Date(0),
    params: { metadata: { refundStepKey: "original" } } };
  await expect(run("refund")).rejects.toThrow("aged add-on refund");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
  expect(Delivery.updateOne).not.toHaveBeenCalled();
});
