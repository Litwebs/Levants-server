"use strict";
jest.mock("../../utils/stripe.util", () => ({
  subscriptions: { list: jest.fn(), update: jest.fn() },
  customers: { retrieve: jest.fn(), update: jest.fn() },
  paymentMethods: { retrieve: jest.fn() },
}));
const mongoose = require("mongoose");
const PaymentMethod = require("../../models/paymentMethod.model");
const Subscription = require("../../models/subscription.model");
const stripe = require("../../utils/stripe.util");
const { setCustomerDefaultCard: setDefault, cardIsUsedBySubscription: used } = require("../../services/customerPortal/subscriptionPaymentMethod.service");
let customer, method, session;
beforeEach(() => {
  jest.clearAllMocks();
  customer = { _id: "customer", stripeCustomerId: "cus" };
  method = { _id: "new", provider: "stripe", providerReference: "pm_new", isDefault: false };
  session = { withTransaction: async fn => fn(), endSession: jest.fn() };
  jest.spyOn(mongoose, "startSession").mockResolvedValue(session);
  jest.spyOn(PaymentMethod, "updateMany").mockResolvedValue({});
  jest.spyOn(PaymentMethod, "updateOne").mockResolvedValue({ matchedCount: 1 });
  jest.spyOn(Subscription, "updateMany").mockResolvedValue({});
  stripe.paymentMethods.retrieve.mockResolvedValue({ id: "pm_new", type: "card", customer: "cus" });
  stripe.subscriptions.list.mockResolvedValue({ data: [], has_more: false });
  stripe.subscriptions.update.mockResolvedValue({});
  stripe.customers.update.mockResolvedValue({});
  stripe.customers.retrieve.mockResolvedValue({ invoice_settings: { default_payment_method: "pm_new" } });
});
afterEach(() => jest.restoreAllMocks());
it("migrates active and paused subscription pins before switching the customer default", async () => {
  stripe.subscriptions.list.mockResolvedValueOnce({ data: [
    { id: "sub_active", status: "active", default_payment_method: "pm_old" },
    { id: "sub_paused", status: "paused", default_source: "card_old" },
    { id: "sub_cancelled", status: "canceled", default_payment_method: "pm_old" },
  ] });
  await setDefault(customer, method);
  expect(stripe.subscriptions.update.mock.calls.map(c => c[0])).toEqual(["sub_active", "sub_paused"]);
  expect(stripe.subscriptions.update.mock.calls[0][1]).toEqual({ default_payment_method: "", default_source: "" });
  expect(stripe.customers.update.mock.invocationCallOrder[0]).toBeGreaterThan(stripe.subscriptions.update.mock.invocationCallOrder[1]);
  expect(Subscription.updateMany).toHaveBeenCalledWith(expect.objectContaining({ status: { $in: ["active", "paused"] } }),
    { $set: { paymentMethod: "new" } }, { session });
  expect(method.isDefault).toBe(true);
});
it("does not switch customer or local defaults if subscription migration fails, and can retry", async () => {
  stripe.subscriptions.list.mockResolvedValue({ data: [{ id: "sub", status: "active", default_payment_method: "old" }] });
  stripe.subscriptions.update.mockRejectedValueOnce(new Error("Stripe unavailable"));
  await expect(setDefault(customer, method)).rejects.toThrow("Stripe unavailable");
  expect(stripe.customers.update).not.toHaveBeenCalled();
  expect(PaymentMethod.updateMany).not.toHaveBeenCalled();
  await setDefault(customer, method);
  expect(method.isDefault).toBe(true);
});
it("keeps local defaults untouched when the customer update fails", async () => {
  stripe.customers.update.mockRejectedValueOnce(new Error("Stripe unavailable"));
  await expect(setDefault(customer, method)).rejects.toThrow("Stripe unavailable");
  expect(PaymentMethod.updateMany).not.toHaveBeenCalled();
});
it("checks ownership before any billing changes", async () => {
  stripe.paymentMethods.retrieve.mockResolvedValue({ type: "card", customer: "other" });
  await expect(setDefault(customer, method)).rejects.toThrow("not attached");
  expect(stripe.subscriptions.list).not.toHaveBeenCalled();
  expect(stripe.customers.update).not.toHaveBeenCalled();
});
it.each(["active", "paused", "past_due", "trialing", "incomplete"])("protects a card pinned to a %s subscription", async status => {
  stripe.subscriptions.list.mockResolvedValue({ data: [{ id: "sub", status, default_payment_method: { id: "pm_new" } }] });
  expect(await used(customer, method)).toBe(true);
});
it("protects an inherited default card even without a local subscription link", async () => {
  stripe.subscriptions.list.mockResolvedValue({ data: [{ id: "sub", status: "active", default_payment_method: null }] });
  expect(await used(customer, method)).toBe(true);
});
it("checks subscriptions beyond the first provider page", async () => {
  stripe.subscriptions.list.mockResolvedValueOnce({ data: [{ id: "first", status: "canceled" }], has_more: true })
    .mockResolvedValueOnce({ data: [{ id: "second", status: "paused", default_payment_method: "pm_new" }], has_more: false });
  expect(await used(customer, method)).toBe(true);
  expect(stripe.subscriptions.list.mock.calls[1][0].starting_after).toBe("first");
});
it("allows removal when only cancelled subscriptions reference a card", async () => {
  stripe.subscriptions.list.mockResolvedValue({ data: [{ id: "sub", status: "canceled", default_payment_method: "pm_new" }] });
  expect(await used(customer, method)).toBe(false);
});
it("fails closed if live billing references cannot be checked", async () => {
  stripe.subscriptions.list.mockRejectedValueOnce(new Error("Stripe unavailable"));
  await expect(used(customer, method)).rejects.toThrow("Stripe unavailable");
});
