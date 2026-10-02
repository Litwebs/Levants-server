"use strict";
jest.mock("../../models/order.model", () => ({ init: async () => {}, findOne: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn(), exists: jest.fn() }));
jest.mock("../../utils/stripe.util", () => ({ paymentIntents: { retrieve: jest.fn() }, refunds: { create: jest.fn(), retrieve: jest.fn(), list: jest.fn() } }));
const Order = require("../../models/order.model");
const stripe = require("../../utils/stripe.util");
const { refundAcrossSubscriptionPayments: refund, refundFailure } = require("../../services/customerPortal/subscriptionRefundSettlement.service");
let stored;
const clone = value => JSON.parse(JSON.stringify(value));
const query = value => ({ select: () => ({ lean: async () => clone(value) }) });
const run = () => refund({ _id: "sub", subscriptionNumber: "SUB-1" }, { _id: "customer", stripeCustomerId: "cus" }, "pi_base", 800, "pause", "op", "order");
beforeEach(() => {
  jest.resetAllMocks();
  stored = { paymentAllocations: [{ paymentIntentId: "pi_extra" }], refunds: [] };
  Order.findOne.mockImplementation(() => query(stored));
  Order.findOneAndUpdate.mockImplementation((filter, update) => {
    stored.subscriptionRefundPlan = clone(update.$set.subscriptionRefundPlan);
    return query(stored);
  });
  Order.updateOne.mockImplementation(async (filter, update) => {
    const refundId = filter["refunds.stripeRefundId"];
    if (refundId?.$ne && stored.refunds.some(r => r.stripeRefundId === refundId.$ne)) return { matchedCount: 0 };
    for (const [path, value] of Object.entries(update.$set || {})) {
      if (path.startsWith("refunds.")) continue;
      const keys = path.split(".");
      let target = stored;
      for (const key of keys.slice(0, -1)) target = target[key];
      target[keys.at(-1)] = clone(value);
    }
    if (update.$push) stored.refunds.push(clone(update.$push.refunds));
    return { matchedCount: 1 };
  });
  stripe.paymentIntents.retrieve.mockImplementation(async id => ({ id, customer: "cus", status: "succeeded", amount_received: 500 }));
  stripe.refunds.list.mockResolvedValue({ data: [], has_more: false });
  stripe.refunds.create.mockImplementation(async params => ({ id: `re_${params.payment_intent}`, amount: params.amount, status: "succeeded" }));
});
it("reports partial success and retries only the frozen remainder", async () => {
  stripe.refunds.create.mockResolvedValueOnce({ id: "re_base", status: "succeeded", amount: 500 }).mockRejectedValueOnce(new Error("connection lost"));
  let error;
  try { await run(); } catch (e) { error = e; }
  expect(refundFailure(error).data).toEqual({ refundPending: true, refundedMinor: 500, remainingMinor: 300 });
  expect(stored.refunds).toHaveLength(1);
  const failedRequest = stripe.refunds.create.mock.calls[1];
  stripe.paymentIntents.retrieve.mockRejectedValue(new Error("balances must not be recomputed"));
  await run();
  expect(stripe.refunds.create).toHaveBeenCalledTimes(3);
  expect(stripe.refunds.create.mock.calls[2]).toEqual(failedRequest);
  expect(stored.refunds.map(r => r.amountMinor)).toEqual([500, 300]);
  await run();
  expect(stripe.refunds.create).toHaveBeenCalledTimes(3);
});
it("reuses the exact Stripe key after a successful refund cannot be checkpointed", async () => {
  const normalUpdate = Order.updateOne.getMockImplementation();
  Order.updateOne.mockImplementation(async (filter, update) => {
    if (update.$push) throw new Error("database unavailable");
    return normalUpdate(filter, update);
  });
  await expect(run()).rejects.toMatchObject({ confirmedRefundedMinor: 500 });
  Order.updateOne.mockImplementation(normalUpdate);
  await run();
  expect(stripe.refunds.create.mock.calls[1]).toEqual(stripe.refunds.create.mock.calls[0]);
  expect(stored.refunds).toHaveLength(2);
});
it("requires a durable attempt before sending money", async () => {
  Order.updateOne.mockResolvedValue({ matchedCount: 0 });
  await expect(run()).rejects.toThrow("attempt could not be saved");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
it("polls a pending refund instead of creating a replacement", async () => {
  stripe.refunds.create.mockResolvedValueOnce({ id: "re_pending", amount: 500, status: "pending" });
  await expect(run()).rejects.toMatchObject({ confirmedRefundedMinor: 0, remainingMinor: 800 });
  stripe.refunds.retrieve.mockResolvedValue({ id: "re_pending", amount: 500, status: "succeeded" });
  await run();
  expect(stripe.refunds.retrieve).toHaveBeenCalledWith("re_pending");
  expect(stripe.refunds.create).toHaveBeenCalledTimes(2);
  expect(stored.refunds).toHaveLength(2);
});
it.each([true, false])("reconciles an expired ambiguous attempt without recreating it (found: %s)", async found => {
  stripe.refunds.create.mockRejectedValueOnce(new Error("timeout"));
  await expect(run()).rejects.toThrow("timeout");
  const step = stored.subscriptionRefundPlan.steps[0];
  step.startedAt = new Date(Date.now() - 25 * 3600000).toISOString();
  stripe.refunds.list.mockResolvedValue({ data: found ? [{ id: "re_old", amount: 500, status: "succeeded", metadata: step.params.metadata }] : [], has_more: false });
  stripe.refunds.create.mockClear();
  if (found) {
    await run();
    expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
    expect(stripe.refunds.create.mock.calls[0][0].payment_intent).toBe("pi_extra");
  } else {
    await expect(run()).rejects.toThrow("needs reconciliation");
    expect(stripe.refunds.create).not.toHaveBeenCalled();
  }
});
it("checks all history pages and reserves pending refunds before starting", async () => {
  stripe.refunds.list.mockResolvedValueOnce({ data: [{ id: "re_1", amount: 100, status: "succeeded" }], has_more: true })
    .mockResolvedValueOnce({ data: [{ id: "re_2", amount: 150, status: "pending" }], has_more: false });
  await expect(run()).rejects.toThrow("Insufficient captured");
  expect(stripe.refunds.list.mock.calls[1][0].starting_after).toBe("re_1");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
  expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
});
it("does not use unrelated payments to cover an order's refund", async () => {
  stored.paymentAllocations = [];
  await expect(run()).rejects.toThrow("Insufficient captured");
  expect(stripe.paymentIntents.retrieve).toHaveBeenCalledTimes(1);
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
it("rejects a payment owned by another Stripe customer", async () => {
  stripe.paymentIntents.retrieve.mockResolvedValue({ status: "succeeded", customer: "cus_other", amount: 1000 });
  await expect(run()).rejects.toThrow("owner mismatch");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
