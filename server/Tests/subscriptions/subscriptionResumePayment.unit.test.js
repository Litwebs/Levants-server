"use strict";
jest.mock("../../utils/stripe.util", () => ({ customers: { retrieve: jest.fn() },
  paymentIntents: { create: jest.fn(), retrieve: jest.fn(), list: jest.fn() } }));
const Subscription = require("../../models/subscription.model");
const Customer = require("../../models/customer.model");
const Payment = require("../../models/payment.model");
const stripe = require("../../utils/stripe.util");
const clock = require("../../utils/subscriptionClock.util");
const { prepareResumePayment: prepare, recoverResumePayment: recover } = require("../../services/customerPortal/subscriptionResumePayment.service");
let sub, plan, intent, now;
beforeEach(async () => {
  jest.clearAllMocks();
  now = Date.parse("2026-10-09T10:00:00Z");
  jest.spyOn(clock, "now").mockImplementation(() => now);
  jest.spyOn(Subscription, "updateOne").mockResolvedValue({ matchedCount: 1 });
  jest.spyOn(Customer, "findById").mockResolvedValue({ stripeCustomerId: "cus" });
  jest.spyOn(Payment, "findOneAndUpdate").mockResolvedValue({});
  stripe.customers.retrieve.mockResolvedValue({ invoice_settings: { default_payment_method: "pm_original" } });
  sub = { _id: "s", customer: "c", subscriptionNumber: "SUB", customerVersion: 2 };
  plan = await prepare(sub, { amountMinor: 400, nextDeliveryDate: new Date(now + 3 * 86400000), orderId: "o" });
  intent = { id: "pi", customer: "cus", currency: "gbp", amount: 400, amount_received: 400,
    status: "succeeded", metadata: plan.chargeParams.metadata };
  stripe.paymentIntents.create.mockResolvedValue(intent);
  stripe.paymentIntents.retrieve.mockResolvedValue(intent);
});
afterEach(() => jest.restoreAllMocks());
it("requires a saved plan before creating a payment", async () => {
  sub.resumePaymentPlan = null;
  Subscription.updateOne.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(prepare(sub, { amountMinor: 400, nextDeliveryDate: new Date(now) })).rejects.toThrow("database unavailable");
  expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
});
it("retries a lost response with the original card, amount, date and key", async () => {
  stripe.paymentIntents.create.mockRejectedValueOnce(new Error("response lost"));
  await expect(recover(sub, plan)).rejects.toThrow("response lost");
  stripe.customers.retrieve.mockResolvedValue({ invoice_settings: { default_payment_method: "pm_changed" } });
  expect(await prepare(sub, { amountMinor: 999, nextDeliveryDate: new Date(now), orderId: "new" })).toBe(plan);
  await recover(sub, plan);
  expect(stripe.paymentIntents.create.mock.calls[1]).toEqual(stripe.paymentIntents.create.mock.calls[0]);
  expect(Payment.findOneAndUpdate).toHaveBeenCalledWith({ subscription: "s", providerReference: "pi" },
    { $setOnInsert: expect.objectContaining({ order: "o", amount: 4, status: "paid" }) }, expect.any(Object));
});
it.each(["processing", "requires_action", "requires_payment_method"])("does not accept a %s payment", async status => {
  stripe.paymentIntents.create.mockResolvedValue({ ...intent, status, amount_received: 0 });
  await expect(recover(sub, plan)).rejects.toThrow("has not succeeded");
  expect(plan.paymentIntent.status).toBe(status);
  expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
});
it.each([{ customer: "different" }, { currency: "usd" }, { amount: 401 }, { amount_received: 399 }])("rejects mismatched payment backing %j", async fields => {
  stripe.paymentIntents.create.mockResolvedValue({ ...intent, ...fields });
  await expect(recover(sub, plan)).rejects.toThrow(/does not match|has not succeeded/);
  expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
});
it("retrieves the known payment after a local ledger failure", async () => {
  Payment.findOneAndUpdate.mockRejectedValueOnce(new Error("ledger unavailable"));
  await expect(recover(sub, plan)).rejects.toThrow("ledger unavailable");
  await recover(sub, plan);
  expect(stripe.paymentIntents.create).toHaveBeenCalledTimes(1);
  expect(stripe.paymentIntents.retrieve).toHaveBeenCalledWith("pi");
});
it("reconciles an aged lost response across payment history pages", async () => {
  now += 25 * 3600000;
  stripe.paymentIntents.list.mockResolvedValueOnce({ data: [{ id: "other" }], has_more: true })
    .mockResolvedValueOnce({ data: [intent], has_more: false });
  await recover(sub, plan);
  expect(stripe.paymentIntents.list.mock.calls[1][0].starting_after).toBe("other");
  expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
});
it("does not create an aged unknown payment", async () => {
  now += 25 * 3600000;
  stripe.paymentIntents.list.mockResolvedValue({ data: [], has_more: false });
  await expect(recover(sub, plan)).rejects.toThrow("needs reconciliation");
  expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
});
it("only replaces a confirmed unpaid decline, saving the new attempt first", async () => {
  plan.paymentIntent = { ...intent, status: "requires_payment_method", amount_received: 0 };
  stripe.paymentIntents.retrieve.mockResolvedValue(plan.paymentIntent);
  stripe.customers.retrieve.mockResolvedValue({ invoice_settings: { default_payment_method: "pm_new" } });
  const previousKey = plan.idempotencyKey;
  await recover(sub, plan);
  expect(plan.idempotencyKey).not.toBe(previousKey);
  expect(stripe.paymentIntents.create.mock.calls[0][0].payment_method).toBe("pm_new");
  expect(Subscription.updateOne.mock.invocationCallOrder.at(-2)).toBeLessThan(stripe.paymentIntents.create.mock.invocationCallOrder[0]);
});
