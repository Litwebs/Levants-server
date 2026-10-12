"use strict";
jest.mock("../../utils/stripe.util", () => ({}));
jest.mock("../../services/customerPortal/subscriptionEmailNotifications.service", () => ({ sendSubscriptionUpdateEmail: jest.fn() }));
jest.mock("../../services/customerPortal/subscriptionRefundSettlement.service", () => ({ hasUnfinishedCardRefund: jest.fn(async () => false) }));
const mongoose = require("mongoose");
const Subscription = require("../../models/subscription.model");
const Order = require("../../models/order.model");
const Notification = require("../../models/customerNotification.model");
const settings = require("../../services/subscriptionSettings.service");
const Delivery = require("../../models/subscriptionDelivery.model");
const service = require("../../services/customerPortal/customerSubscriptions.service");
afterEach(() => jest.restoreAllMocks());
test("slot scheduling cannot extend a subscription with cancellation already scheduled", async () => {
  jest.spyOn(Delivery, "find").mockReturnValue({ select() { return this; }, session() { return this; }, lean: async () => [] });
  const write = jest.spyOn(Delivery, "updateOne").mockResolvedValue({});
  const nextDeliveryDate = new Date(Date.now() + 7 * 86400000);
  await service.scheduleUpcomingDeliveries({ _id: "s", customer: "c", status: "active",
    isCancellationScheduled: true, cancellationEffectiveAfter: new Date(), nextDeliveryDate,
    frequency: "weekly", preferredDeliveryDay: 1, preferredDeliveryDays: [1] });
  expect(write).not.toHaveBeenCalled();
});

test("the customer schedule update cannot create future slots after scheduled cancellation", async () => {
  const subscription = { _id: "s", customer: "c", status: "active", items: [],
    isCancellationScheduled: true, cancellationEffectiveAfter: new Date(),
    nextDeliveryDate: new Date(Date.now() + 7 * 86400000), frequency: "weekly",
    preferredDeliveryDay: 1, preferredDeliveryDays: [1], save: jest.fn(async () => {}) };
  const query = { select() { return this; }, session() { return this; }, sort() { return this; },
    lean: async () => [], exec: async () => [], then: resolve => resolve([]) };
  jest.spyOn(Subscription, "findOne").mockResolvedValue(subscription);
  jest.spyOn(Delivery, "find").mockReturnValue(query);
  jest.spyOn(Delivery, "deleteMany").mockResolvedValue({});
  const write = jest.spyOn(Delivery, "updateOne").mockResolvedValue({});
  jest.spyOn(Order, "find").mockReturnValue(query);
  jest.spyOn(settings, "getOrCreateSettings").mockResolvedValue({ deliveryDays: [1, 3], cutoffDaysBefore: 1, cutoffTime: "10:00" });
  jest.spyOn(mongoose.connection, "transaction").mockImplementation(async execute => execute({}));
  jest.spyOn(Notification, "create").mockResolvedValue({});
  const result = await service.UpdateSubscription({ customerId: "c", subscriptionId: "s",
    preferredDeliveryDay: 3, preferredDeliveryDays: [3] });
  expect(result.success).toBe(false);
  expect(write).not.toHaveBeenCalled();
});
