"use strict";
jest.mock("../../utils/stripe.util", () => ({
  customers: { retrieve: jest.fn(async () => ({ invoice_settings: { default_payment_method: "pm_test" } })) },
  paymentIntents: { create: jest.fn(async () => { throw new Error("Stop before any real payment"); }) },
}));
jest.mock("../../services/customerPortal/subscriptionEmailNotifications.service", () => ({}));
jest.mock("../../services/customerPortal/subscriptionRefundSettlement.service", () => ({ hasUnfinishedCardRefund: jest.fn(async () => false) }));
const mongoose = require("mongoose");
const Subscription = require("../../models/subscription.model");
const Delivery = require("../../models/subscriptionDelivery.model");
const Variant = require("../../models/variant.model");
const Order = require("../../models/order.model");
const Customer = require("../../models/customer.model");
const Mutation = require("../../models/subscriptionMutation.model");
const settings = require("../../services/subscriptionSettings.service");
const clock = require("../../utils/subscriptionClock.util");
const stripe = require("../../utils/stripe.util");
const credit = require("../../services/storeCredit.service");
const { UpdateSubscription } = require("../../services/customerPortal/customerSubscriptions.service");
afterEach(() => jest.restoreAllMocks());
test.each(["increase", "decrease"].flatMap(action =>
  ["unpaid", "older-order", "later-order", "unlinked-order"].map(target => [action, target])))
("does not settle a %s against an %s instead of the actual delivery", async (action, target) => {
  jest.clearAllMocks();
  const id = () => new mongoose.Types.ObjectId();
  const customerId = id(), subscriptionId = id(), variantId = id(), productId = id(), paidOrderId = id();
  const item = { variant: variantId, product: productId, name: "Product – Variant", sku: "test", quantity: 1, unitPrice: 12 };
  const subscription = { _id: subscriptionId, customer: customerId, status: "active", frequency: "weekly",
    preferredDeliveryDay: 0, preferredDeliveryDays: [0, 3], customerVersion: 0,
    subscriptionNumber: "SUB-TEST-UNPAID-DAY",
    nextDeliveryDate: new Date("2026-10-18T09:00:00Z"), items: [{ ...item, quantity: action === "decrease" ? 3 : 2 }],
    deliveryDayPlans: [0, 3].map(day => ({ day, items: [{ ...item, quantity: day === 3 && action === "decrease" ? 2 : 1 }] })) };
  const query = value => ({ sort() { return this; }, lean: async () => value });
  jest.spyOn(clock, "now").mockReturnValue(Date.parse("2026-10-10T21:00:00Z"));
  jest.spyOn(settings, "getOrCreateSettings").mockResolvedValue({ deliveryDays: [0, 3], cutoffDaysBefore: 2, cutoffTime: "22:00" });
  jest.spyOn(Subscription, "findOne").mockResolvedValue(subscription);
  jest.spyOn(Variant, "find").mockReturnValue({ populate: async () => [{ _id: variantId, name: "Variant", sku: "test", price: 12,
    product: { _id: productId, name: "Product", status: "active", isSubscriptionEligible: true } }] });
  jest.spyOn(Delivery, "find").mockReturnValue(query([
    { scheduledDate: new Date("2026-10-18T09:00:00Z"), status: "generated", order: paidOrderId },
    { scheduledDate: new Date("2026-10-21T09:00:00Z"), status: "scheduled", order: null },
  ]));
  // Sunday is paid; Wednesday has no captured delivery order.
  const orders = [{ _id: paidOrderId, subscription: subscriptionId,
    status: "paid", deliveryStatus: "ordered", amountPaid: 13,
    deliveryDate: new Date("2026-10-18T09:00:00Z") }];
  if (target !== "unpaid") orders.push({ _id: id(), subscription: subscriptionId,
    status: "paid", deliveryStatus: "ordered", amountPaid: 13,
    deliveryDate: new Date(target === "older-order" ? "2026-10-14T09:00:00Z" :
      target === "later-order" ? "2026-10-28T09:00:00Z" : "2026-10-21T09:00:00Z") });
  jest.spyOn(Order, "find").mockReturnValue(query(orders));
  jest.spyOn(Customer, "findById").mockResolvedValue({ _id: customerId, stripeCustomerId: "cus_test" });
  jest.spyOn(Mutation, "findOne").mockResolvedValue({ _id: id(), operationId: "unpaid-wednesday", attempts: 1, save: async () => {} });
  jest.spyOn(credit, "addCredit").mockResolvedValue({ ok: false, message: "Stop before any real credit" });
  const result = await UpdateSubscription({ customerId, subscriptionId, operationId: "unpaid-wednesday", changedDeliveryDays: [3],
    deliveryDayPlans: [
      { day: 0, items: [{ variantId: String(variantId), quantity: 1 }] },
      { day: 3, items: [{ variantId: String(variantId), quantity: action === "increase" ? 2 : 1 }] },
    ] });
  expect(result.success).toBe(false);
  expect(result.data).toEqual({ paymentPending: true, deliveryDay: 3 });
  expect(subscription.deliveryDayPlans.find(plan => plan.day === 3).items[0].quantity)
    .toBe(action === "decrease" ? 2 : 1);
  expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
  expect(credit.addCredit).not.toHaveBeenCalled();
});
