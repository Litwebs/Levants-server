"use strict";
jest.mock("../../utils/stripe.util", () => ({}));
jest.mock("../../Integration/google.geocode", () => ({ geocodeAddress: jest.fn() }));
jest.mock("../../services/subscriptions/subscriptionEmailNotifications.service", () => ({}));
const mongoose = require("mongoose");
const Order = require("../../models/order.model");
const Customer = require("../../models/customer.model");
const Subscription = require("../../models/subscription.model");
const Delivery = require("../../models/subscriptionDelivery.model");
const { presentCancelledSubscriptionOrders } = require("../../services/subscriptions/subscriptionOrderPresentation.service");
const customerOrders = require("../../services/customerPortal/customerOrders.service");
const adminSubscriptions = require("../../services/customerPortal/adminSubscriptions.service");
const adminOrders = require("../../services/orders/orders.manage.service");
const allAdminOrders = require("../../services/orders/orders.list.service");
let owner, subscription, order, slot;
beforeEach(async () => {
  owner = new mongoose.Types.ObjectId();
  await Customer.collection.insertOne({ _id: owner, firstName: "Legacy", lastName: "Buyer", email: "legacy-" + owner + "@example.test" });
  const product = new mongoose.Types.ObjectId(), variant = new mongoose.Types.ObjectId();
  const address = { line1: "1 Test Street", city: "London", postcode: "SW1A 1AA", country: "GB" };
  subscription = await Subscription.create({ customer: owner, subscriptionNumber: "SUB-" + new mongoose.Types.ObjectId(),
    status: "cancelled", frequency: "weekly", preferredDeliveryDay: 0, startDate: new Date("2026-10-01T09:00:00Z"),
    items: [{ product, variant, name: "Milk", sku: "MILK", quantity: 1, unitPrice: 2 }], deliveryAddress: address });
  order = await Order.create({ customer: owner, subscription: subscription._id, orderType: "subscription_generated",
    items: [{ product, variant, name: "Milk", sku: "MILK", quantity: 1, price: 2, subtotal: 2 }],
    deliveryAddress: address, location: { lat: 51.5, lng: 0 }, deliveryDate: new Date("2026-10-18T09:00:00Z"),
    subtotal: 2, total: 2, amountPaid: 2, status: "refunded", deliveryStatus: "ordered", reservationExpiresAt: new Date() });
  slot = await Delivery.create({ subscription: subscription._id, order: order._id,
    scheduledDate: order.deliveryDate, status: "cancelled" });
});
test("presents an explicit cancelled legacy slot without altering its historical order or payment", async () => {
  const [shown] = await presentCancelledSubscriptionOrders([order]);
  expect(shown).toMatchObject({ status: "refunded", deliveryStatus: "cancelled", portalDeliveryStatus: "cancelled", amountPaid: 2 });
  const stored = await Order.findById(order._id);
  expect(stored.deliveryStatus).toBe("ordered");
  expect(stored.portalDeliveryStatus).toBeNull();
  expect(stored.status).toBe("refunded");
});
test("customer and admin read paths expose the same cancelled delivery while preserving refunded payment", async () => {
  const list = await customerOrders.ListOrders({ customerId: owner });
  const detail = await customerOrders.GetOrder({ customerId: owner, orderId: order._id });
  const adminList = await adminSubscriptions.AdminGetSubscriptionOrders({ subscriptionId: subscription._id });
  const adminDetail = await adminOrders.GetOrderById({ orderId: String(order._id) });
  const globalList = await allAdminOrders.ListOrders({});
  const searched = await allAdminOrders.ListOrders({ filters: { search: order.orderId } });
  for (const row of [list.data.orders[0], detail.data.order, adminList.data.orders[0], adminDetail.data, globalList.data.orders[0], searched.data.orders[0]]) {
    expect(row).toMatchObject({ status: "refunded", deliveryStatus: "cancelled" });
  }
  expect((await Order.findById(order._id)).deliveryStatus).toBe("ordered");
});
test.each(["dispatched", "in_transit", "delivered", "returned"])("keeps physical %s fulfillment even when a cancelled slot exists", async deliveryStatus => {
  const [shown] = await presentCancelledSubscriptionOrders([{ ...order.toObject(), deliveryStatus }]);
  expect(shown.deliveryStatus).toBe(deliveryStatus);
});
test("does not infer cancellation for paid or partially refunded deliveries", async () => {
  for (const status of ["paid", "partially_refunded"]) {
    const [shown] = await presentCancelledSubscriptionOrders([{ ...order.toObject(), status }]);
    expect(shown.deliveryStatus).toBe("ordered");
  }
});
test("requires a cancelled slot with the same subscription and delivery date", async () => {
  slot.status = "generated"; await slot.save();
  expect((await presentCancelledSubscriptionOrders([order]))[0].deliveryStatus).toBe("ordered");
  slot.status = "cancelled"; slot.scheduledDate = new Date("2026-10-25T09:00:00Z"); await slot.save();
  expect((await presentCancelledSubscriptionOrders([order]))[0].deliveryStatus).toBe("ordered");
  slot.scheduledDate = order.deliveryDate; slot.subscription = new mongoose.Types.ObjectId(); await slot.save();
  expect((await presentCancelledSubscriptionOrders([order]))[0].deliveryStatus).toBe("ordered");
});
