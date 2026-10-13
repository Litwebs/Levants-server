"use strict";
jest.mock("../../models/order.model", () => ({ init: async () => {}, findOne: jest.fn(), findOneAndUpdate: jest.fn(), updateOne: jest.fn(), exists: jest.fn(), countDocuments: jest.fn() }));
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
  stored = { paymentAllocations: [{ paymentIntentId: "pi_base", amountMinor: 500 }, { paymentIntentId: "pi_extra", amountMinor: 500 }], refunds: [] };
  Order.countDocuments.mockResolvedValue(1);
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
  expect(stripe.paymentIntents.retrieve).not.toHaveBeenCalled();
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
it("rejects a payment owned by another Stripe customer", async () => {
  stripe.paymentIntents.retrieve.mockResolvedValue({ status: "succeeded", customer: "cus_other", amount: 1000 });
  await expect(run()).rejects.toThrow("owner mismatch");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
it("splits a delivery refund without consuming another delivery's shared capture", async () => {
  stored.paymentAllocations = [{ paymentIntentId: "pi_base", amountMinor: 1300 }, { paymentIntentId: "pi_extra", amountMinor: 1200 }];
  stripe.paymentIntents.retrieve.mockImplementation(async id => ({ id, customer: "cus", status: "succeeded", amount_received: id === "pi_base" ? 2600 : 1200 }));
  await refund({ _id: "sub" }, { _id: "customer", stripeCustomerId: "cus" }, "pi_base", 2500, "pause", "op", "order");
  expect(stripe.refunds.create.mock.calls.map(([params]) => [params.payment_intent, params.amount])).toEqual([["pi_base", 1300], ["pi_extra", 1200]]);
});
it("does not double-count a prior refund present in Stripe and the delivery ledger", async () => {
  stored.refunds = [{ stripeRefundId: "re_prior", paymentIntentId: "pi_base", amountMinor: 200, status: "succeeded" }];
  stripe.paymentIntents.retrieve.mockResolvedValue({ customer: "cus", status: "succeeded", amount_received: 2000 });
  stripe.refunds.list.mockImplementation(async ({ payment_intent }) => ({ data: payment_intent === "pi_base" ? [{ id: "re_prior", amount: 200, status: "succeeded", metadata: { orderId: "order" } }] : [], has_more: false }));
  await run();
  expect(stripe.refunds.create.mock.calls.map(([params]) => params.amount)).toEqual([300, 500]);
});
it("reserves a pending local refund even before provider history includes it", async () => {
  stored.refunds = [{ stripeRefundId: "re_pending", paymentIntentId: "pi_base", amountMinor: 250, status: "pending" }];
  stripe.paymentIntents.retrieve.mockResolvedValue({ customer: "cus", status: "succeeded", amount_received: 2000 });
  await expect(run()).rejects.toThrow("Insufficient captured");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
it("fails closed on an unattributed refund on a shared payment", async () => {
  Order.countDocuments.mockResolvedValue(2);
  stripe.refunds.list.mockResolvedValue({ data: [{ id: "re_unknown", amount: 100, status: "succeeded" }], has_more: false });
  await expect(run()).rejects.toThrow("unattributed refund");
  expect(Order.findOneAndUpdate).not.toHaveBeenCalled();
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
it("does not subtract another delivery's refund from this delivery's allocation", async () => {
  stripe.paymentIntents.retrieve.mockResolvedValue({ customer: "cus", status: "succeeded", amount_received: 2000 });
  stripe.refunds.list.mockResolvedValue({ data: [{ id: "re_other", amount: 600, status: "succeeded", metadata: { orderId: "other" } }], has_more: false });
  await run();
  expect(stripe.refunds.create.mock.calls.map(([params]) => params.amount)).toEqual([500, 300]);
});
it.each([undefined, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid allocation amounts (%s) before sending money", async amountMinor => {
  stored.paymentAllocations[0].amountMinor = amountMinor;
  await expect(run()).rejects.toThrow("allocation needs reconciliation");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
it("preserves bounded refunds for a uniquely owned legacy capture", async () => {
  stored.paymentAllocations = [];
  stored.stripePaymentIntentId = "pi_base";
  stored.amountPaid = 8;
  stripe.paymentIntents.retrieve.mockResolvedValue({ customer: "cus", status: "succeeded", amount_received: 2000 });
  await run();
  expect(stripe.refunds.create.mock.calls[0][0].amount).toBe(800);
});
it("does not infer a missing legacy allocation from a shared invoice", async () => {
  stored.paymentAllocations = [];
  stored.stripePaymentIntentId = "pi_base";
  stored.amountPaid = 8;
  Order.countDocuments.mockResolvedValue(2);
  await expect(run()).rejects.toThrow("Legacy refund allocation needs reconciliation");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
it("recovers only the independent base amount when a legacy ledger contains an add-on", async () => {
  stored.paymentAllocations = [{ paymentIntentId: "pi_extra", amountMinor: 300 }];
  stored.stripePaymentIntentId = "pi_base";
  stored.amountPaid = 8;
  stripe.paymentIntents.retrieve.mockResolvedValue({ customer: "cus", status: "succeeded", amount_received: 2000 });
  await run();
  expect(stripe.refunds.create.mock.calls.map(([params]) => params.amount)).toEqual([500, 300]);
});
