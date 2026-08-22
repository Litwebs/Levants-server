"use strict";

// Read-only audit for subscription billing/fulfilment drift.
// Prints subscription identifiers and dates only; no customer PII and no writes.

const env = require("../config/env");
const mongoose = require("mongoose");
const Stripe = require("stripe");

const Subscription = require("../models/subscription.model");
const SubscriptionDelivery = require("../models/subscriptionDelivery.model");
const Order = require("../models/order.model");
const DeliveryBatch = require("../models/deliveryBatch.model");

const stripe = new Stripe(env.stripe.secretKey, {
  apiVersion: env.stripe.apiVersion,
});

function londonWeekday(value) {
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
  }).format(new Date(value));
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[weekday];
}

function londonDateKey(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function effectiveDays(subscription) {
  if (
    subscription.frequency === "weekly" &&
    Array.isArray(subscription.preferredDeliveryDays) &&
    subscription.preferredDeliveryDays.length > 0
  ) {
    return subscription.preferredDeliveryDays.map(Number);
  }
  return [Number(subscription.preferredDeliveryDay)];
}

async function main() {
  await mongoose.connect(env.mongoUri);
  const [deliveryIndexes, orderIndexes] = await Promise.all([
    mongoose.connection.db.collection("subscriptiondeliveries").indexes(),
    mongoose.connection.db.collection("orders").indexes(),
  ]);
  console.log(
    "INDEX_INTEGRITY",
    JSON.stringify({
      subscriptionDeliveryUnique: deliveryIndexes.some(
        (index) =>
          index.unique &&
          index.key?.subscription === 1 &&
          index.key?.scheduledDate === 1,
      ),
      subscriptionOrderInvoiceUnique: orderIndexes.some(
        (index) =>
          index.unique &&
          index.key?.stripeInvoiceId === 1 &&
          index.key?.subscription === 1 &&
          index.key?.deliveryDate === 1,
      ),
    }),
  );
  const subscriptions = await Subscription.find({})
    .sort({ createdAt: 1 })
    .lean();

  for (const subscription of subscriptions) {
    const [orders, deliveries, invoicePage] = await Promise.all([
      Order.find({ subscription: subscription._id })
        .sort({ deliveryDate: 1 })
        .lean(),
      SubscriptionDelivery.find({ subscription: subscription._id })
        .sort({ scheduledDate: 1 })
        .lean(),
      subscription.stripeSubscriptionId
        ? stripe.invoices.list({
            subscription: subscription.stripeSubscriptionId,
            limit: 100,
          })
        : Promise.resolve({ data: [] }),
    ]);

    const days = effectiveDays(subscription);
    const ordersOutsideCurrentSchedule = orders.filter(
      (order) =>
        order.deliveryDate && !days.includes(londonWeekday(order.deliveryDate)),
    );
    const paidInvoices = (invoicePage.data || []).filter(
      (invoice) => invoice.paid || invoice.status === "paid",
    );
    const linkedInvoiceIds = new Set(
      orders.map((order) => order.stripeInvoiceId).filter(Boolean),
    );
    const unlinkedPaidInvoices = paidInvoices.filter(
      (invoice) => !linkedInvoiceIds.has(invoice.id),
    );
    const duplicateSlotDates = [];
    const slotCounts = new Map();
    for (const delivery of deliveries) {
      const key = new Date(delivery.scheduledDate).toISOString();
      slotCounts.set(key, (slotCounts.get(key) || 0) + 1);
    }
    for (const [date, count] of slotCounts) {
      if (count > 1) duplicateSlotDates.push({ date, count });
    }

    console.log(
      JSON.stringify({
        subscriptionNumber: subscription.subscriptionNumber,
        status: subscription.status,
        frequency: subscription.frequency,
        days,
        nextDeliveryDate: subscription.nextDeliveryDate,
        orderCount: orders.length,
        deliveryCount: deliveries.length,
        paidInvoiceCount: paidInvoices.length,
        unlinkedPaidInvoiceIds: unlinkedPaidInvoices.map((invoice) => invoice.id),
        ordersOutsideCurrentSchedule: ordersOutsideCurrentSchedule.map(
          (order) => ({
            orderId: order.orderId,
            deliveryDate: order.deliveryDate,
            weekday: londonWeekday(order.deliveryDate),
          }),
        ),
        duplicateSlotDates,
      }),
    );
  }

  const batches = await DeliveryBatch.find({}).populate("orders").lean();
  console.log("BATCH_INTEGRITY");
  for (const batch of batches) {
    const batchDay = londonDateKey(batch.deliveryDate);
    const mismatches = (batch.orders || []).filter((order) => {
      if (!order?.deliveryDate) return true;
      const orderDay = londonDateKey(order.deliveryDate);
      return orderDay !== batchDay;
    });
    console.log(
      JSON.stringify({
        batchId: String(batch._id),
        deliveryDate: batch.deliveryDate,
        status: batch.status,
        orderCount: (batch.orders || []).length,
        mismatches: mismatches.map((order) => ({
          orderId: order.orderId,
          orderType: order.orderType,
          deliveryDate: order.deliveryDate || null,
        })),
      }),
    );
  }

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
