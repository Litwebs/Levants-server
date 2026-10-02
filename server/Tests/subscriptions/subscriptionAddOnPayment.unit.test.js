"use strict";
jest.mock("../../utils/stripe.util", () => ({ paymentIntents: { create: jest.fn(), retrieve: jest.fn() } }));
const stripe = require("../../utils/stripe.util");
const Mutation = require("../../models/subscriptionMutation.model");
const { recoverAddOnPayment } = require("../../services/customerPortal/subscriptionAddOnPayment.service");
let mutation;
beforeEach(() => {
  mutation = { _id: "m", addOnSnapshot: { startedAt: new Date(), deliveryId: "original", items: [],
    chargeParams: { amount: 500, payment_method: "pm_original" }, idempotencyKey: "original-key" } };
  stripe.paymentIntents.create.mockReset().mockResolvedValue({ id: "pi_original", status: "succeeded" });
  stripe.paymentIntents.retrieve.mockReset();
  jest.spyOn(Mutation, "updateOne").mockResolvedValue({ matchedCount: 1 });
});
afterEach(() => jest.restoreAllMocks());
it("retries a lost response with the exact frozen payment request", async () => {
  stripe.paymentIntents.create.mockRejectedValueOnce(new Error("response lost"));
  expect((await recoverAddOnPayment(mutation)).ok).toBe(false);
  expect((await recoverAddOnPayment(mutation)).ok).toBe(true);
  expect(stripe.paymentIntents.create.mock.calls[0]).toEqual(stripe.paymentIntents.create.mock.calls[1]);
  expect(stripe.paymentIntents.create).toHaveBeenLastCalledWith(mutation.addOnSnapshot.chargeParams, { idempotencyKey: "original-key" });
});
it("does not charge again when payment was recorded before fulfillment failed", async () => {
  await recoverAddOnPayment(mutation);
  expect((await recoverAddOnPayment(mutation)).ok).toBe(true);
  expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
});
it("retrieves a known processing intent without creating a new charge", async () => {
  mutation.addOnSnapshot.paymentIntent = { id: "pi_pending", status: "processing" };
  stripe.paymentIntents.retrieve.mockResolvedValue({ id: "pi_pending", status: "succeeded" });
  expect((await recoverAddOnPayment(mutation)).ok).toBe(true);
  expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
});
it("refuses to reuse an expired key when the payment outcome is unknown", async () => {
  mutation.addOnSnapshot.startedAt = new Date(0);
  expect((await recoverAddOnPayment(mutation)).ok).toBe(false);
  expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
});
it("recovers a recorded success even after the key retention window", async () => {
  mutation.addOnSnapshot.startedAt = new Date(0);
  mutation.addOnSnapshot.paymentIntent = { id: "pi_original", status: "succeeded" };
  expect((await recoverAddOnPayment(mutation)).ok).toBe(true);
  expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
});
it("persists an intent returned with a Stripe error and never fulfills a decline", async () => {
  const intent = { id: "pi_declined", status: "requires_payment_method" };
  stripe.paymentIntents.create.mockRejectedValueOnce({ payment_intent: intent });
  expect((await recoverAddOnPayment(mutation)).ok).toBe(false);
  stripe.paymentIntents.retrieve.mockResolvedValue(intent);
  expect((await recoverAddOnPayment(mutation)).ok).toBe(false);
  expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
});
it("propagates a payment checkpoint write failure before fulfillment", async () => {
  Mutation.updateOne.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(recoverAddOnPayment(mutation)).rejects.toThrow("database unavailable");
  expect(mutation.addOnSnapshot.paymentIntent).toBeUndefined();
});
