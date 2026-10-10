"use strict";
jest.mock("../../utils/stripe.util", () => ({ paymentIntents: { create: jest.fn() } }));
jest.mock("../../services/customerPortal/subscriptionEmailNotifications.service", () => ({}));
const Subscription = require("../../models/subscription.model");
const Customer = require("../../models/customer.model");
const ProductVariant = require("../../models/variant.model");
const stripe = require("../../utils/stripe.util");
const service = require("../../services/customerPortal/customerSubscriptions.service");
const actions = ["AddSubscriptionItem", "ReplaceSubscriptionItems", "UpdateSubscriptionItem", "RemoveSubscriptionItem"];
const plans = [
  ["current delivery days", { preferredDeliveryDays: [0, 3] }],
  ["current day plans", { deliveryDayPlans: [{ day: 0 }, { day: 3 }] }],
  ["staged day plans", { pendingChanges: { deliveryDayPlans: [{ day: 0 }, { day: 3 }] } }],
  ["staged delivery days", { pendingChanges: { preferredDeliveryDays: [0, 3] } }],
];
afterEach(() => jest.restoreAllMocks());
describe.each(actions)("%s", action => {
  it.each(plans)("rejects aggregate edits with %s before billing or fulfillment work", async (_label, fields) => {
    const subscription = { _id: "s", status: "active", frequency: "weekly", preferredDeliveryDay: 0,
      preferredDeliveryDays: [0], items: [], ...fields };
    const original = JSON.stringify(subscription);
    jest.spyOn(Subscription, "findOne").mockResolvedValue(subscription);
    const customerRead = jest.spyOn(Customer, "findById");
    const variantRead = jest.spyOn(ProductVariant, "findById");
    const result = await service[action]({ customerId: "c", subscriptionId: "s", variantId: "v", itemId: "i", quantity: 2, items: [] });
    expect(result.success).toBe(false);
    expect(result.message).toBe("Please edit products for each delivery day separately.");
    expect(Subscription.findOne).toHaveBeenCalledWith({ _id: "s", customer: "c" });
    expect(JSON.stringify(subscription)).toBe(original);
    expect(customerRead).not.toHaveBeenCalled();
    expect(variantRead).not.toHaveBeenCalled();
    expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  });
});
