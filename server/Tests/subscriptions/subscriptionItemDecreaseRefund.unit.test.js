"use strict";
jest.mock("../../utils/stripe.util", () => ({ refunds: { create: jest.fn(), retrieve: jest.fn(), list: jest.fn() } }));
const stripe = require("../../utils/stripe.util");
const Mutation = require("../../models/subscriptionMutation.model");
const Order = require("../../models/order.model");
const { refundItemDecrease: refund } = require("../../services/customerPortal/subscriptionItemDecreaseRefund.service");
let mutation;
beforeEach(() => {
  jest.clearAllMocks();
  mutation = { _id: "m" };
  jest.spyOn(Mutation, "findOne").mockResolvedValue(mutation);
  jest.spyOn(Mutation, "updateOne").mockImplementation(async (_filter, update) => {
    if (update.$set.decreaseRefundSnapshot) mutation.decreaseRefundSnapshot = update.$set.decreaseRefundSnapshot;
    if (update.$set["decreaseRefundSnapshot.refund"]) mutation.decreaseRefundSnapshot.refund = update.$set["decreaseRefundSnapshot.refund"];
    return { matchedCount: 1 };
  });
  jest.spyOn(Order, "findOne").mockReturnValue({ sort: () => ({ select: () => ({ lean: async () => ({ _id: "order", stripePaymentIntentId: "pi" }) }) }) });
  stripe.refunds.create.mockReset().mockImplementation(async params => ({ id: "re", status: "succeeded", amount: params.amount }));
  stripe.refunds.retrieve.mockReset();
  stripe.refunds.list.mockResolvedValue({ data: [], has_more: false });
});
afterEach(() => jest.restoreAllMocks());
const run = () => refund({ _id: "s", customer: "c", subscriptionNumber: "SUB" }, 500, "op");
test("saves the immutable target before asking Stripe for a refund", async () => {
  expect((await run()).refundedMinor).toBe(500);
  expect(Mutation.updateOne.mock.invocationCallOrder[0]).toBeLessThan(stripe.refunds.create.mock.invocationCallOrder[0]);
  expect(Order.findOne).toHaveBeenCalledWith(expect.objectContaining({ deliveryStatus: "ordered" }));
});
test("retries a lost response with exactly the saved refund request", async () => {
  stripe.refunds.create.mockRejectedValueOnce(new Error("response lost"));
  await expect(run()).rejects.toThrow("response lost");
  expect((await run()).refundedMinor).toBe(500);
  expect(stripe.refunds.create.mock.calls[0]).toEqual(stripe.refunds.create.mock.calls[1]);
  expect(Order.findOne).toHaveBeenCalledTimes(1);
});
test("a failed checkpoint never starts a refund", async () => {
  Mutation.updateOne.mockResolvedValueOnce({ matchedCount: 0 });
  await expect(run()).rejects.toThrow("No refund was started");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
test("retrieves a pending refund and waits for confirmed success", async () => {
  stripe.refunds.create.mockResolvedValueOnce({ id: "re", amount: 500, status: "pending" });
  await expect(run()).rejects.toThrow("not confirmed");
  stripe.refunds.retrieve.mockResolvedValue({ id: "re", amount: 500, status: "succeeded" });
  expect((await run()).refundedMinor).toBe(500);
  expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
});
test("an expired ambiguous key cannot start another refund", async () => {
  stripe.refunds.create.mockRejectedValueOnce(new Error("lost"));
  await expect(run()).rejects.toThrow();
  mutation.decreaseRefundSnapshot.startedAt = new Date(0);
  await expect(run()).rejects.toThrow("aged decrease refund");
  expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
});
