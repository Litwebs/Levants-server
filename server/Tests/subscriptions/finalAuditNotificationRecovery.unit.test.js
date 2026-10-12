"use strict";
jest.mock("../../services/subscriptions/subscriptionLifecycleLock.service", () => ({ withSubscriptionLifecycleLock: async (_id, execute) => execute() }));
jest.mock("../../utils/stripe.util", () => ({ invoices: { retrieve: jest.fn() }, subscriptions: { update: jest.fn() } }));
jest.mock("../../services/customerPortal/customerSubscriptions.service", () => ({}));
jest.mock("../../services/customerPortal/subscriptionEmailNotifications.service", () => ({ sendSubscriptionUpdateEmail: jest.fn() }));
const Subscription = require("../../models/subscription.model");
const Order = require("../../models/order.model");
const Notification = require("../../models/customerNotification.model");
const stripe = require("../../utils/stripe.util");
const { HandleSubscriptionInvoiceFailed } = require("../../services/subscriptions/subscriptionWebhook.service");
afterEach(() => jest.restoreAllMocks());
test("a retried failed-payment webhook recovers a notification failure after pausing", async () => {
  const subscription = { _id: "s", customer: "c", stripeSubscriptionId: "sub", status: "active", save: jest.fn(async () => {}) };
  jest.spyOn(Subscription, "findOne").mockImplementation(() => {
    const query = Promise.resolve(subscription);
    query.populate = () => Promise.resolve(subscription);
    return query;
  });
  jest.spyOn(Order, "exists").mockResolvedValue(false);
  jest.spyOn(Notification, "exists").mockResolvedValue(false);
  stripe.invoices.retrieve.mockResolvedValue({ id: "invoice", subscription: "sub", status: "open", paid: false });
  stripe.subscriptions.update.mockResolvedValue({});
  const notify = jest.spyOn(Notification, "create").mockRejectedValueOnce(new Error("temporary notification write failure")).mockResolvedValue({});
  await expect(HandleSubscriptionInvoiceFailed({ id: "invoice", subscription: "sub" })).rejects.toThrow("temporary notification write failure");
  expect(subscription.status).toBe("paused");
  await HandleSubscriptionInvoiceFailed({ id: "invoice", subscription: "sub" });
  expect(notify).toHaveBeenCalledTimes(2);
});
