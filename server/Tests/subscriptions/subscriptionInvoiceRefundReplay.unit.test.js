jest.mock("../../services/subscriptions/subscriptionLifecycleLock.service", () => ({ withSubscriptionLifecycleLock: async (_id, execute) => execute() }));
"use strict";
jest.mock("../../models/subscriptionInvoiceFulfillment.model", () => ({
  findOne: jest.fn(() => ({ lean: async () => null })),
  findOneAndUpdate: jest.fn((_filter, update) => ({ lean: async () => ({ _id: "plan", ...update.$setOnInsert }) })),
  updateOne: jest.fn(async () => ({ matchedCount: 1 })),
}));
jest.mock("../../utils/stripe.util", () => ({}));
jest.mock("../../services/customerPortal/customerSubscriptions.service", () => ({
  scheduleUpcomingDeliveries: jest.fn(async () => {}), promotePendingChanges: jest.fn(), syncStripeSubscriptionPrice: jest.fn(),
}));
jest.mock("../../services/customerPortal/subscriptionEmailNotifications.service", () => ({ sendSubscriptionUpdateEmail: jest.fn() }));
jest.mock("../../Integration/google.geocode", () => ({ geocodeAddress: jest.fn(async () => ({ lat: 51, lng: 0 })) }));
const Subscription = require("../../models/subscription.model");
const Delivery = require("../../models/subscriptionDelivery.model");
const Order = require("../../models/order.model");
const Payment = require("../../models/payment.model");
const { HandleSubscriptionInvoicePaid: paid } = require("../../services/subscriptions/subscriptionWebhook.service");
afterEach(() => jest.restoreAllMocks());
function setup(status, hasLedger = false) {
  const date = new Date("2026-10-10T09:00:00Z");
  const subscription = { _id: "s", customer: { _id: "c" }, frequency: "weekly", preferredDeliveryDay: 6,
    nextDeliveryDate: date, status: "active", save: jest.fn(async () => {}) };
  const order = { _id: "o", status, refund: { refundedAt: new Date("2026-10-09T12:00:00Z") }, deliveryDate: date, items: [{ subtotal: 10 }], deliveryFee: 1 };
  const slot = { scheduledDate: date, order: "o", status: "generated" };
  jest.spyOn(Subscription, "findOne").mockReturnValue({ populate: async () => subscription });
  jest.spyOn(Order, "find").mockReturnValue({ sort: async () => [order] });
  jest.spyOn(Order, "findOne").mockResolvedValue(order);
  jest.spyOn(Delivery, "find").mockReturnValue({ sort: async () => [slot] });
  jest.spyOn(Delivery, "findOne").mockResolvedValue(slot);
  jest.spyOn(Payment, "exists").mockResolvedValue(hasLedger);
  jest.spyOn(Payment, "updateMany").mockResolvedValue({ modifiedCount: 1 });
  jest.spyOn(Payment, "findOneAndUpdate").mockResolvedValue({});
  return { id: "in_paid", subscription: "sub", payment_intent: "pi", paid: true };
}
it.each(["paid", "refunded"])("preserves an existing settled payment when the order is %s", async status => {
  await paid(setup(status, true));
  expect(Payment.exists).toHaveBeenCalledWith(expect.objectContaining({ status: { $in: ["paid", "refunded"] } }));
  expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
});
it("repairs a missing refunded ledger as refunded, never paid", async () => {
  await paid(setup("refunded"));
  expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(expect.any(Object), { $setOnInsert: expect.objectContaining({ status: "refunded", amount: 11,
    refundedAt: new Date("2026-10-09T12:00:00Z") }) }, expect.any(Object));
});
it("repairs a paid ledger left behind by an interrupted order refund", async () => {
  await paid(setup("refunded", true));
  expect(Payment.updateMany).toHaveBeenCalledWith({ order: "o", subscription: "s", providerReference: "pi", status: "paid" },
    { $set: { status: "refunded", refundedAt: new Date("2026-10-09T12:00:00Z") } });
  expect(Payment.findOneAndUpdate).not.toHaveBeenCalled();
});
it("still repairs a genuinely missing paid ledger", async () => {
  await paid(setup("paid"));
  expect(Payment.findOneAndUpdate).toHaveBeenCalledWith(expect.any(Object), { $setOnInsert: expect.objectContaining({ status: "paid", amount: 11 }) }, expect.any(Object));
  expect(Payment.updateMany).not.toHaveBeenCalled();
});
it('normalizes a Clover invoice once and preserves its subscription parent', async () => {
  const invoice = setup('paid', true);
  const stripe = require('../../utils/stripe.util');
  stripe.invoices = { retrieve: jest.fn(async () => ({ id: invoice.id })) };
  const { subscription, ...event } = invoice;
  await paid({ ...event, parent: { subscription_details: { subscription } } });
  expect(stripe.invoices.retrieve).toHaveBeenCalledTimes(1);
  expect(Payment.exists).toHaveBeenCalled();
});
it('ignores a normalized non-subscription invoice without reading a subscription', async () => {
  const stripe = require('../../utils/stripe.util');
  stripe.invoices = { retrieve: jest.fn(async () => ({ id: 'one-time' })) };
  jest.spyOn(Subscription, 'findOne');
  await paid({ id: 'one-time' });
  expect(stripe.invoices.retrieve).toHaveBeenCalledTimes(1);
  expect(Subscription.findOne).not.toHaveBeenCalled();
});
