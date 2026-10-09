"use strict";
jest.mock("../../models/subscriptionInvoiceFulfillment.model", () => ({
  init: async () => {},
  findOne: jest.fn(() => ({ lean: async () => null })),
  findOneAndUpdate: jest.fn((_filter, update) => ({ lean: async () => ({ _id: "plan", ...update.$setOnInsert }) })),
  updateOne: jest.fn(async () => ({ matchedCount: 1 })),
}));
jest.mock("../../services/customerPortal/customerSubscriptions.service", () => ({
  scheduleUpcomingDeliveries: jest.fn(async () => {}), promotePendingChanges: jest.fn(), syncStripeSubscriptionPrice: jest.fn(),
}));
jest.mock("../../utils/stripe.util", () => ({ customers: { retrieve: jest.fn() },
  subscriptions: { update: jest.fn() }, paymentIntents: { create: jest.fn() },
  invoices: { list: jest.fn() }, refunds: { list: jest.fn() } }));
jest.mock("../../services/customerPortal/subscriptionEmailNotifications.service", () => ({ sendSubscriptionUpdateEmail: jest.fn(async () => {}) }));
jest.mock("../../services/subscriptions/subscriptionLifecycleLock.service", () => ({ withSubscriptionLifecycleLock: async (_id, execute) => execute() }));
jest.mock("../../Integration/google.geocode", () => ({ geocodeAddress: jest.fn(async () => ({ lat: 51, lng: 0 })) }));
const Subscription = require("../../models/subscription.model");
const Delivery = require("../../models/subscriptionDelivery.model");
const Order = require("../../models/order.model");
const Payment = require("../../models/payment.model");
const Variant = require("../../models/variant.model");
const Notification = require("../../models/customerNotification.model");
const Customer = require("../../models/customer.model");
const stripe = require("../../utils/stripe.util");
const settings = require("../../services/subscriptionSettings.service");
const clock = require("../../utils/subscriptionClock.util");
const Plan = require("../../models/subscriptionInvoiceFulfillment.model");
const { HandleSubscriptionInvoicePaid } = require("../../services/subscriptions/subscriptionWebhook.service");
function query(value) {
  const q = { then: (ok, fail) => Promise.resolve(value).then(ok, fail) };
  for (const name of ["select", "populate", "sort", "session", "lean"]) q[name] = () => q;
  q.exec = async () => value;
  return q;
}
let sub, future;
beforeEach(() => {
  jest.clearAllMocks();
  Plan.findOne.mockReturnValue({ lean: async () => null });
  const item = { variant: "507f1f77bcf86cd799439011", product: "507f1f77bcf86cd799439012",
    name: "Milk", sku: "MILK", unitPrice: 2.5, quantity: 1 };
  sub = { _id: "s", customer: "c", stripeSubscriptionId: "stripe-sub", subscriptionNumber: "SUB",
    status: "paused", frequency: "weekly", preferredDeliveryDay: 0, preferredDeliveryDays: [0],
    nextDeliveryDate: new Date("2026-07-12T08:00:00Z"), items: [item],
    deliveryAddress: { line1: "1 Street", city: "London", postcode: "SW1A 1AA", country: "UK" },
    save: jest.fn(async () => {}), toObject: () => ({ ...sub }) };
  future = [12, 19, 26].map(day => ({ scheduledDate: new Date(`2026-07-${day}T08:00:00Z`), status: "scheduled" }));
  jest.spyOn(clock, "now").mockReturnValue(Date.parse("2026-07-06T12:00:00Z"));
  jest.spyOn(Subscription, "findOne").mockImplementation(() => query(sub));
  jest.spyOn(Delivery, "find").mockImplementation(() => query(future));
  jest.spyOn(Order, "findOne").mockImplementation(() => query(null));
  jest.spyOn(Variant, "find").mockImplementation(() => query([]));
  jest.spyOn(Customer, "findById").mockImplementation(() => query({ _id: "c", stripeCustomerId: "cus" }));
  jest.spyOn(settings, "getOrCreateSettings").mockResolvedValue({ deliveryDays: [0, 3], cutoffDaysBefore: 0, cutoffTime: "23:59" });
  jest.spyOn(Notification, "create").mockResolvedValue({});
  jest.spyOn(Payment, "findOneAndUpdate").mockResolvedValue({});
  stripe.customers.retrieve.mockResolvedValue({ invoice_settings: { default_payment_method: "pm" } });
  stripe.invoices.list.mockResolvedValue({ data: [{ id: "paid-invoice", amount_paid: 350, payment_intent: "old-pi" }] });
  stripe.refunds.list.mockResolvedValue({ data: [{ id: "refunded-old-payment", status: "succeeded", amount: 350 }] });
  stripe.subscriptions.update.mockResolvedValue({});
});
afterEach(() => jest.restoreAllMocks());
test("replays a legacy invoice only for its known order after a day is added", async () => {
  sub.status = "active";
  sub.customer = { _id: "c", stripeCustomerId: "cus" };
  sub.preferredDeliveryDays = [0, 3];
  sub.deliveryDayPlans = [0, 3].map(day => ({ day, items: sub.items }));
  const old = { _id: "old-order", status: "paid", deliveryDate: future[0].scheduledDate,
    items: [{ subtotal: 2.5 }], deliveryFee: 1, total: 3.5 };
  const slots = [future[0], { scheduledDate: new Date("2026-07-15T08:00:00Z"), status: "scheduled" }];
  for (const slot of slots) slot.save = jest.fn(async () => {});
  slots[0].order = old._id;
  Order.findOne.mockImplementation(filter => query(filter._id === old._id ? old : null));
  jest.spyOn(Order, "find").mockImplementation(() => query([old]));
  const created = jest.spyOn(Order, "create").mockImplementation(async fields => ({ ...fields, _id: "new-order", orderId: "NEW" }));
  Delivery.find.mockImplementation(filter => query(filter.scheduledDate?.$lt ? slots : future));
  jest.spyOn(Delivery, "findOne").mockImplementation(filter => query(filter.scheduledDate?.$gte?.getTime() === Date.parse("2026-07-14T23:00:00Z") ? slots[1] : slots[0]));
  jest.spyOn(Payment, "exists").mockResolvedValue(true);
  jest.spyOn(Payment, "updateMany").mockResolvedValue({});
  await HandleSubscriptionInvoicePaid({ id: "paid-invoice", subscription: "stripe-sub", payment_intent: "old-pi", paid: true, amount_paid: 350 });
  expect(created).not.toHaveBeenCalled();
  expect(Plan.findOneAndUpdate.mock.calls[0][1].$setOnInsert.deliveries).toHaveLength(1);
  expect(Plan.findOneAndUpdate.mock.calls[0][1].$setOnInsert.legacyReviewRequired).toBe(true);
  expect(stripe.paymentIntents.create).not.toHaveBeenCalled();
});

it("reuses the frozen entitlement after the order date, current schedule and items change", async () => {
  const originalDate = new Date("2026-07-12T08:00:00Z");
  const movedDate = new Date("2026-07-15T08:00:00Z");
  sub.status = "active";
  sub.customer = { _id: "c" };
  sub.items[0].quantity = 3;
  sub.nextDeliveryDate = movedDate;
  sub.frequency = "monthly";
  const existing = { _id: "original-order", status: "paid", deliveryDate: movedDate };
  jest.spyOn(Order, "find").mockImplementation(() => query([existing]));
  Order.findOne.mockImplementation(filter => query(filter._id === "original-order" ? existing : null));
  const create = jest.spyOn(Order, "create");
  jest.spyOn(Delivery, "findOne").mockResolvedValue({ order: existing._id });
  jest.spyOn(Payment, "exists").mockResolvedValue(false);
  jest.spyOn(Payment, "updateMany").mockResolvedValue({});
  Plan.findOne.mockReturnValue({ lean: async () => ({ _id: "plan", completedAt: new Date(),
    billingWindowEnd: new Date("2026-07-19T08:00:00Z"), deliveries: [{ scheduledDate: originalDate,
      orderId: "original-order", amountMinor: 350 }] }) });
  await HandleSubscriptionInvoicePaid({ id: "paid-invoice", subscription: "stripe-sub", payment_intent: "old-pi", paid: true, amount_paid: 350 });
  expect(create).not.toHaveBeenCalled();
  expect(Plan.findOneAndUpdate).not.toHaveBeenCalled();
  expect(Payment.findOneAndUpdate.mock.calls[0][1].$setOnInsert.amount).toBe(3.5);
  expect(sub.nextDeliveryDate).toEqual(movedDate);
});

it("rejects a new invoice whose captured amount does not fund its current delivery plan", async () => {
  sub.status = "active";
  sub.customer = { _id: "c" };
  jest.spyOn(Order, "find").mockImplementation(() => query([]));
  const create = jest.spyOn(Order, "create");
  Plan.findOne.mockReturnValue({ lean: async () => null });
  Delivery.find.mockImplementation(() => query([future[0]]));
  await expect(HandleSubscriptionInvoicePaid({ id: "short-invoice", subscription: "stripe-sub",
    payment_intent: "old-pi", paid: true, amount_paid: 349 })).rejects.toThrow("does not match the delivery plan");
  expect(create).not.toHaveBeenCalled();
});
