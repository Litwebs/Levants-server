"use strict";
jest.mock("../../utils/stripe.util", () => ({ paymentIntents: { retrieve: jest.fn() },
  refunds: { list: jest.fn(), create: jest.fn(), retrieve: jest.fn() } }));
const mongoose = require("mongoose");
const stripe = require("../../utils/stripe.util");
const Mutation = require("../../models/subscriptionMutation.model");
const Delivery = require("../../models/subscriptionDelivery.model");
const Payment = require("../../models/payment.model");
const { refundUnfulfilledAddOn } = require("../../services/customerPortal/subscriptionUnfulfilledAddOnRefund.service");
let mutation;
beforeEach(() => {
  jest.resetAllMocks();
  mutation = { _id: "m", operationId: "op", addOnSnapshot: { deliveryId: "delivery", amountMinor: 250,
    paymentIntent: { id: "pi" }, chargeParams: { customer: "cus", currency: "gbp" } } };
  stripe.paymentIntents.retrieve.mockResolvedValue({ id: "pi", status: "succeeded", customer: "cus", currency: "gbp", amount_received: 250 });
  stripe.refunds.list.mockResolvedValue({ data: [], has_more: false });
  stripe.refunds.create.mockResolvedValue({ id: "refund", payment_intent: "pi", amount: 250, status: "succeeded" });
  stripe.refunds.retrieve.mockResolvedValue({ id: "refund", payment_intent: "pi", amount: 250, status: "succeeded" });
  jest.spyOn(Mutation, "updateOne").mockImplementation(async (_filter, { $set }) => {
    if ($set["addOnSnapshot.unfulfilledRefund"]) mutation.addOnSnapshot.unfulfilledRefund = $set["addOnSnapshot.unfulfilledRefund"];
    if ($set["addOnSnapshot.unfulfilledRefund.refund"]) mutation.addOnSnapshot.unfulfilledRefund.refund = $set["addOnSnapshot.unfulfilledRefund.refund"];
    return { matchedCount: 1 };
  });
  jest.spyOn(Payment, "updateOne").mockResolvedValue({ matchedCount: 1 });
  jest.spyOn(Delivery, "findById").mockReturnValue({ session: async () => null });
  jest.spyOn(mongoose.connection, "transaction").mockImplementation(async fn => fn("session"));
});
afterEach(() => jest.restoreAllMocks());
const run = () => refundUnfulfilledAddOn({ _id: "s" }, mutation);
test("returns a closed delivery's captured payment exactly once and completes its ledger", async () => {
  expect((await run()).data).toMatchObject({ paymentOutcome: "refunded", refundedMinor: 250 });
  expect((await run()).success).toBe(true);
  expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
  expect(Payment.updateOne).toHaveBeenCalledWith(expect.any(Object),
    { $set: expect.objectContaining({ status: "refunded" }) }, { session: "session" });
});
test("a lost response reuses the frozen refund request", async () => {
  stripe.refunds.create.mockRejectedValueOnce(new Error("response lost"));
  await expect(run()).rejects.toThrow("response lost");
  await run();
  expect(stripe.refunds.create.mock.calls[0]).toEqual(stripe.refunds.create.mock.calls[1]);
});
test("a local commit failure keeps the refund checkpoint and cannot refund twice", async () => {
  Payment.updateOne.mockRejectedValueOnce(new Error("local commit failed"));
  await expect(run()).rejects.toThrow("local commit failed");
  await run();
  expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
});
test("a pending refund never completes the purchase or its payment ledger", async () => {
  stripe.refunds.create.mockResolvedValue({ id: "refund", amount: 250, status: "pending" });
  await expect(run()).rejects.toThrow("not yet confirmed");
  expect(Payment.updateOne).not.toHaveBeenCalled();
  await run();
  expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
});
test("a foreign capture or external refund cannot start another return of money", async () => {
  stripe.paymentIntents.retrieve.mockResolvedValueOnce({ status: "succeeded", customer: "foreign", currency: "gbp", amount_received: 250 });
  await expect(run()).rejects.toThrow("does not match");
  stripe.refunds.list.mockResolvedValue({ data: [{ status: "succeeded", amount: 250 }], has_more: false });
  await expect(run()).rejects.toThrow("external add-on refund");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
