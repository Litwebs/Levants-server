"use strict";
jest.mock("../../services/subscriptions/subscriptionLifecycleLock.service", () => ({
  withSubscriptionLifecycleLock: async (_id, execute) => execute(),
}));
jest.mock("../../utils/stripe.util", () => ({ subscriptions: { retrieve: jest.fn() } }));
jest.mock("../../services/customerPortal/customerSubscriptions.service", () => ({}));
jest.mock("../../services/customerPortal/subscriptionEmailNotifications.service", () => ({ sendSubscriptionUpdateEmail: jest.fn() }));
const Subscription = require("../../models/subscription.model");
const Delivery = require("../../models/subscriptionDelivery.model");
const stripe = require("../../utils/stripe.util");
const { HandleStripeSubscriptionUpdated: updated, HandleStripeSubscriptionDeleted: deleted } = require("../../services/subscriptions/subscriptionWebhook.service");
afterEach(() => jest.restoreAllMocks());
test("updated followed by deleted still closes scheduled slots", async () => {
  const sub = { _id: "s", status: "active", save: jest.fn(async () => {}) };
  jest.spyOn(Subscription, "findOne").mockResolvedValue(sub);
  jest.spyOn(Delivery, "updateMany").mockResolvedValue({ modifiedCount: 1 });
  stripe.subscriptions.retrieve.mockResolvedValue({ id: "stripe", status: "canceled" });
  await updated({ id: "stripe" });
  expect(sub.status).toBe("cancelled");
  await deleted({ id: "stripe" });
  expect(Delivery.updateMany).toHaveBeenCalledWith(
    { subscription: "s", status: "scheduled", order: null }, { $set: { status: "cancelled" } },
  );
});
test("a failed cleanup can retry after cancellation status was saved", async () => {
  const sub = { _id: "s", status: "active", save: jest.fn(async () => {}) };
  jest.spyOn(Subscription, "findOne").mockResolvedValue(sub);
  jest.spyOn(Delivery, "updateMany").mockRejectedValueOnce(new Error("temporary database failure")).mockResolvedValue({});
  await expect(deleted({ id: "stripe" })).rejects.toThrow("temporary database failure");
  expect(sub.status).toBe("cancelled");
  await deleted({ id: "stripe" });
  expect(Delivery.updateMany).toHaveBeenCalledTimes(2);
  expect(sub.save).toHaveBeenCalledTimes(1);
});
test("scheduled cancellation keeps protected deliveries open", async () => {
  jest.spyOn(Subscription, "findOne").mockResolvedValue({ _id: "s", status: "active", isCancellationScheduled: true });
  jest.spyOn(Delivery, "updateMany").mockResolvedValue({});
  stripe.subscriptions.retrieve.mockResolvedValue({ id: "stripe", status: "canceled" });
  await updated({ id: "stripe" });
  await deleted({ id: "stripe" });
  expect(Delivery.updateMany).not.toHaveBeenCalled();
});
