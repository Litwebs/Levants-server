"use strict";

const mongoose = require("mongoose");
const Order = require("../../models/order.model");
const { replaceRecurringOrderItems } = require("../../utils/subscriptionOrderItems.util");

const product = new mongoose.Types.ObjectId();
const variant = new mongoose.Types.ObjectId();
const recurring = { product, variant, name: "Milk", sku: "MILK", unitPrice: 2.5, quantity: 3 };
const addOn = {
  product, variant, name: "Milk at purchase", sku: "MILK", price: 2,
  quantity: 2, subtotal: 4, isSubscriptionAddOn: true,
};
const plain = (value) => value.toObject ? value.toObject() : value;

it.each(["plain", "mongoose"])("preserves paid snapshots and allocations through repeated edits (%s)", (kind) => {
  const data = {
    items: [{ ...addOn, name: "Recurring", price: 2.5, quantity: 3, subtotal: 7.5, isSubscriptionAddOn: false }, addOn],
    subtotal: 11.5, total: 12.5, deliveryFee: 1, amountPaid: 12.5,
    paymentAllocations: [{ paymentIntentId: "pi_addon", source: "delivery_add_on", amountMinor: 400, idempotencyKey: "addon:1" }],
  };
  const order = kind === "mongoose" ? new Order(data) : structuredClone(data);
  const paidSnapshot = plain(order.items[1]);
  const allocations = order.paymentAllocations.map(plain);
  for (const quantity of [4, 1, 1, 3]) {
    replaceRecurringOrderItems(order, [{ ...recurring, quantity }]);
    expect(order.items).toHaveLength(2);
    expect(plain(order.items[1])).toEqual(paidSnapshot);
    expect(order.items[0].quantity).toBe(quantity);
    expect(order.items[0].isSubscriptionAddOn).toBeFalsy();
    expect(order.subtotal).toBe(quantity * 2.5 + 4);
    expect(order.total).toBe(quantity * 2.5 + 5);
    expect(order.amountPaid).toBe(12.5);
    expect(order.paymentAllocations.map(plain)).toEqual(allocations);
  }
  expect(recurring.quantity).toBe(3);
});

it("keeps multiple purchases of the same variant separate and local to their order", () => {
  const order = { items: [addOn, { ...addOn, price: 3, subtotal: 6 }] };
  const otherDay = { items: [{ ...addOn, name: "Other delivery" }], total: 4 };
  const before = structuredClone(otherDay);
  replaceRecurringOrderItems(order, [recurring]);
  expect(order.items.map(i => i.subtotal)).toEqual([7.5, 4, 6]);
  expect(order.total).toBe(17.5);
  expect(otherDay).toEqual(before);
});

it("replaces orders without add-ons and permits an empty recurring portion", () => {
  const order = { items: [{ subtotal: 99 }], deliveryFee: 1 };
  replaceRecurringOrderItems(order, [recurring]);
  expect(order.items).toHaveLength(1);
  expect(order.total).toBe(8.5);
  order.items.push(addOn);
  replaceRecurringOrderItems(order, []);
  expect(order.items).toEqual([addOn]);
  expect(order.total).toBe(5);
});
