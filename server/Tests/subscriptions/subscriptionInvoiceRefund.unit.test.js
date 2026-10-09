"use strict";
jest.mock("../../utils/stripe.util", () => ({ paymentIntents: { retrieve: jest.fn() },
  subscriptions: { update: jest.fn() }, refunds: { create: jest.fn(), retrieve: jest.fn(), list: jest.fn() } }));
jest.mock("../../services/subscriptions/subscriptionStock.service", () => ({ releaseStock: jest.fn(async () => {}) }));
const mongoose = require("mongoose");
const Subscription = require("../../models/subscription.model");
const Plan = require("../../models/subscriptionInvoiceFulfillment.model");
const Order = require("../../models/order.model");
const Payment = require("../../models/payment.model");
const stripe = require("../../utils/stripe.util");
const { refundUnfulfilledInvoice: refund } = require("../../services/subscriptions/subscriptionInvoiceRefund.service");
const query = value => ({ then: (ok, fail) => Promise.resolve(value).then(ok, fail),
  lean: async () => value, populate() { return this; }, session() { return this; } });
let plan, invoice;
beforeEach(() => {
  jest.clearAllMocks();
  plan = null;
  invoice = { id: "in", subscription: "stripe-sub", payment_intent: "pi", currency: "gbp", amount_paid: 350,
    created: 1780000000, period_start: 1780000000, period_end: 1780600000 };
  jest.spyOn(Subscription, "findOne").mockReturnValue(query({ _id: "s", stripeSubscriptionId: "stripe-sub",
    customer: { _id: "c", stripeCustomerId: "cus" } }));
  jest.spyOn(Subscription, "updateOne").mockResolvedValue({ matchedCount: 1 });
  jest.spyOn(Order, "exists").mockImplementation(() => query(null));
  jest.spyOn(Plan, "findOne").mockImplementation(() => query(plan));
  jest.spyOn(Plan, "findOneAndUpdate").mockImplementation((_filter, update) => {
    plan = { _id: "p", ...update.$setOnInsert }; return query(plan);
  });
  jest.spyOn(Plan, "updateOne").mockImplementation(async (_filter, update) => {
    for (const [key, value] of Object.entries(update.$set)) {
      if (key === "refundSnapshot.refund") plan.refundSnapshot.refund = value;
      else plan[key] = value;
    }
    return { matchedCount: 1 };
  });
  jest.spyOn(Payment, "findOneAndUpdate").mockResolvedValue({});
  jest.spyOn(Payment, "updateOne").mockResolvedValue({ matchedCount: 1 });
  jest.spyOn(mongoose.connection, "transaction").mockImplementation(async execute => execute("session"));
  stripe.paymentIntents.retrieve.mockResolvedValue({ id: "pi", status: "succeeded", customer: "cus", currency: "gbp", amount_received: 350 });
  stripe.refunds.list.mockResolvedValue({ data: [], has_more: false });
  stripe.refunds.create.mockReset().mockResolvedValue({ id: "re", payment_intent: "pi", status: "succeeded", amount: 350 });
  stripe.refunds.retrieve.mockResolvedValue({ id: "re", payment_intent: "pi", status: "succeeded", amount: 350 });
});
afterEach(() => jest.restoreAllMocks());
const run = () => refund(invoice, "Stock unavailable");
test("an unallocated paid invoice is refunded once and future billing is paused", async () => {
  expect((await run()).refundedMinor).toBe(350);
  expect(plan.completedAt).toBeInstanceOf(Date);
  expect(Subscription.updateOne).toHaveBeenCalledWith({ _id: "s" }, expect.objectContaining({
    $set: expect.objectContaining({ status: "paused", pauseReason: "reconciliation" }) }), { session: "session" });
  expect((await run()).stripeRefundId).toBe("re");
  expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
});
test("a lost refund response reuses the frozen request and key", async () => {
  stripe.refunds.create.mockRejectedValueOnce(new Error("response lost"));
  await expect(run()).rejects.toThrow("response lost");
  await run();
  expect(stripe.refunds.create.mock.calls[1]).toEqual(stripe.refunds.create.mock.calls[0]);
});
test("a local completion failure resumes the recorded remote refund", async () => {
  mongoose.connection.transaction.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(run()).rejects.toThrow("database unavailable");
  await run();
  expect(stripe.refunds.create).toHaveBeenCalledTimes(1);
  expect(stripe.refunds.retrieve).toHaveBeenCalledWith("re");
});
test("pending refunds cannot complete the recovery or release inventory", async () => {
  stripe.refunds.create.mockResolvedValueOnce({ id: "re", amount: 350, status: "pending" });
  await expect(run()).rejects.toThrow("not been confirmed");
  expect(mongoose.connection.transaction).not.toHaveBeenCalled();
});
test("an allocated capture cannot be refunded by the no-fulfillment recovery", async () => {
  Order.exists.mockReturnValue(query({ _id: "paid-order" }));
  await expect(run()).rejects.toThrow("per-order repair");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
test.each([{ customer: "foreign" }, { currency: "usd" }, { amount_received: 349 }])("rejects a mismatched paid capture: %j", async difference => {
  stripe.paymentIntents.retrieve.mockResolvedValue({ id: "pi", status: "succeeded", customer: "cus", currency: "gbp", amount_received: 350, ...difference });
  await expect(run()).rejects.toThrow("does not match");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
test("an external refund needs review before another refund is issued", async () => {
  stripe.refunds.list.mockResolvedValueOnce({ data: [{ id: "external", amount: 100, status: "succeeded" }], has_more: false });
  await expect(run()).rejects.toThrow("external invoice refund");
  expect(stripe.refunds.create).not.toHaveBeenCalled();
});
