"use strict";
jest.mock("../../utils/stripe.util", () => ({
  invoices: { retrieve: jest.fn() },
  subscriptions: { retrieve: jest.fn(), update: jest.fn(async () => ({})) },
}));
jest.mock("../../services/customerPortal/subscriptionEmailNotifications.service", () => ({ sendSubscriptionUpdateEmail: jest.fn() }));
jest.mock("../../services/customerPortal/customerSubscriptions.service", () => ({}));
const Subscription = require("../../models/subscription.model");
const Order = require("../../models/order.model");
const Notification = require("../../models/customerNotification.model");
const stripe = require("../../utils/stripe.util");
const { HandleStripeSubscriptionUpdated: update, HandleSubscriptionInvoiceFailed: fail } = require("../../services/subscriptions/subscriptionWebhook.service");
let local;
beforeEach(() => {
  jest.clearAllMocks();
  local = { _id: "local", customer: "customer", stripeSubscriptionId: "sub", status: "active",
    pauseReason: null, save: jest.fn(async () => {}) };
  jest.spyOn(Subscription, "findOne").mockImplementation(() => {
    const result = Promise.resolve(local);
    result.populate = () => Promise.resolve(local);
    return result;
  });
  jest.spyOn(Order, "exists").mockResolvedValue(false);
  jest.spyOn(Notification, "create").mockResolvedValue({});
  stripe.subscriptions.retrieve.mockResolvedValue({ id: "sub", status: "active", pause_collection: null });
  stripe.invoices.retrieve.mockResolvedValue({ id: "invoice", subscription: "sub", status: "open", paid: false });
  stripe.subscriptions.update.mockResolvedValue({});
});
afterEach(() => jest.restoreAllMocks());
it.each(["customer", "payment_failed", null])("active updates preserve a %s pause", async reason => {
  Object.assign(local, { status: "paused", pauseReason: reason, pausedUntil: new Date("2030-01-01") });
  await update({ id: "sub", status: "active", pause_collection: null });
  expect(local.status).toBe("paused");
  expect(local.pausedUntil).toEqual(new Date("2030-01-01"));
  expect(local.save).not.toHaveBeenCalled();
});
it("ignores an old pause snapshot after Stripe has resumed", async () => {
  await update({ id: "sub", status: "active", pause_collection: { behavior: "void" } });
  expect(local.status).toBe("active");
  expect(local.save).not.toHaveBeenCalled();
});
it("syncs a Stripe-owned pause using the current provider state", async () => {
  Object.assign(local, { status: "paused", pauseReason: "stripe" });
  await update({ id: "sub", pause_collection: { behavior: "void" } });
  expect(local.status).toBe("active");
  expect(local.save).toHaveBeenCalledTimes(1);
});
it("never reopens a cancelled subscription on a pause event", async () => {
  local.status = "cancelled";
  stripe.subscriptions.retrieve.mockResolvedValue({ id: "sub", status: "active", pause_collection: { behavior: "void" } });
  await update({ id: "sub" });
  expect(local.status).toBe("cancelled");
  expect(local.save).not.toHaveBeenCalled();
});
it.each(["paid", "void", "uncollectible", "draft"])("ignores failure snapshots when current invoice is %s", async status => {
  stripe.invoices.retrieve.mockResolvedValue({ id: "invoice", subscription: "sub", status });
  await fail({ id: "invoice", subscription: "sub", status: "open" });
  expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  expect(Notification.create).not.toHaveBeenCalled();
  expect(local.status).toBe("active");
});
it("ignores a failed invoice already fulfilled locally", async () => {
  Order.exists.mockResolvedValue(true);
  await fail({ id: "invoice", subscription: "sub" });
  expect(stripe.subscriptions.update).not.toHaveBeenCalled();
  expect(Notification.create).not.toHaveBeenCalled();
});
it("records the failed invoice and suppresses duplicate notifications", async () => {
  await fail({ id: "invoice", subscription: "sub" });
  expect(local.status).toBe("paused");
  expect(local.paymentFailureInvoiceId).toBe("invoice");
  await fail({ id: "invoice", subscription: "sub" });
  expect(stripe.subscriptions.update).toHaveBeenCalledTimes(1);
  expect(Notification.create).toHaveBeenCalledTimes(1);
});
it.each(["customer", "stripe"])("does not relabel a deliberate %s pause on failure", async reason => {
  Object.assign(local, { status: "paused", pauseReason: reason });
  await fail({ id: "invoice" });
  expect(local.pauseReason).toBe(reason);
  expect(Notification.create).not.toHaveBeenCalled();
});
it("propagates provider retrieval failures for webhook retry", async () => {
  stripe.invoices.retrieve.mockRejectedValueOnce(new Error("Stripe unavailable"));
  await expect(fail({ id: "invoice" })).rejects.toThrow("Stripe unavailable");
  stripe.subscriptions.retrieve.mockRejectedValueOnce(new Error("Stripe unavailable"));
  await expect(update({ id: "sub" })).rejects.toThrow("Stripe unavailable");
  expect(local.save).not.toHaveBeenCalled();
});
it("does not acknowledge a failed Stripe billing pause as successful", async () => {
  stripe.subscriptions.update.mockRejectedValueOnce(new Error("Stripe unavailable"));
  await expect(fail({ id: "invoice" })).rejects.toThrow("Stripe unavailable");
  expect(local.status).toBe("active");
  expect(Notification.create).not.toHaveBeenCalled();
});
