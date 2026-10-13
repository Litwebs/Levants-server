"use strict";
jest.mock("../../utils/stripe.util", () => ({ paymentIntents: { create: jest.fn() } }));
jest.mock("../../services/customerPortal/subscriptionEmailNotifications.service", () => ({}));
const Subscription = require("../../models/subscription.model");
const Delivery = require("../../models/subscriptionDelivery.model");
const Mutation = require("../../models/subscriptionMutation.model");
const settings = require("../../services/subscriptionSettings.service");
const stripe = require("../../utils/stripe.util");
const service = require("../../services/customerPortal/customerSubscriptions.service");
afterEach(() => jest.restoreAllMocks());
it.each([
  ["missing", null],
  ["past cutoff", { status: "scheduled", scheduledDate: new Date(0) }],
  ["dispatched", { status: "generated", scheduledDate: new Date(Date.now() + 86400000), order: { status: "paid", deliveryStatus: "dispatched" } }],
])("never retargets a retry when the original delivery is %s", async (_name, original) => {
  jest.spyOn(Subscription, "findOne").mockResolvedValue({ _id: "s", customer: "c", status: "active" });
  jest.spyOn(Mutation, "findOne").mockResolvedValue({ addOnSnapshot: { deliveryId: "original" } });
  jest.spyOn(Delivery, "findOne").mockResolvedValueOnce(null)
    .mockReturnValueOnce({ populate: jest.fn().mockResolvedValue(original) });
  const selectUpcoming = jest.spyOn(Delivery, "find");
  jest.spyOn(settings, "getOrCreateSettings").mockResolvedValue({ cutoffDaysBefore: 0, cutoffTime: "23:59" });
  const result = await service.AddNextDeliveryAddOn({ customerId: "c", subscriptionId: "s", operationId: "op" });
  expect(result.success).toBe(false);
  expect(result.data.reconciliationRequired).toBe(true);
  expect(Delivery.findOne).toHaveBeenLastCalledWith({ _id: "original", subscription: "s", customer: "c" });
  expect(selectUpcoming).not.toHaveBeenCalled();
  expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
});
