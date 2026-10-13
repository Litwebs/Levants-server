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
const Mutation = require("../models/subscriptionMutation.model");
const InvoicePlan = require("../models/subscriptionInvoiceFulfillment.model");
const Reservation = require("../models/subscriptionStockReservation.model");
const Customer = require("../models/customer.model");
const Variant = require("../models/variant.model");
const { checkSubscriptionEndpoints } = require("../utils/subscriptionWebhookConfiguration.util");
const { listAllStripePages } = require("../utils/stripePagination.util");

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
  await mongoose.connect(env.mongoUri, { autoIndex: false, autoCreate: false });
  const requiredIndexes = [
    ["paymentmethods", { customer: 1, provider: 1, providerReference: 1 }, "providerReference"],
    ["subscriptiondeliveries", { subscription: 1, scheduledDate: 1 }],
    ["orders", { stripeInvoiceId: 1, subscription: 1, deliveryDate: 1 }, "stripeInvoiceId"],
    ["subscriptionmutations", { customer: 1, operationId: 1 }],
    ["subscriptioninvoicefulfillments", { subscription: 1, invoiceId: 1 }],
    ["subscriptionstockreservations", { key: 1 }],
    ["payments", { subscriptionInvoiceKey: 1 }, "subscriptionInvoiceKey"],
    ["storecredittransactions", { customer: 1, idempotencyKey: 1 }, "idempotencyKey"],
  ];
  const indexResults = await Promise.all(requiredIndexes.map(async ([collection, keys, partialField]) => {
    let indexes;
    try { indexes = await mongoose.connection.db.collection(collection).indexes(); }
    catch (error) { if (error.code !== 26) throw error; indexes = []; }
    const ok = indexes.some(index => index.unique &&
      Object.keys(index.key).length === Object.keys(keys).length &&
      Object.entries(keys).every(([key, value]) => index.key[key] === value) &&
      (!partialField || index.partialFilterExpression?.[partialField]?.$type === "string"));
    return { collection, keys, ok };
  }));
  console.log("INDEX_INTEGRITY", JSON.stringify(indexResults));
  const now = Date.now();
  const stale = new Date(now - 120000);
  const [mutations, plans, reservations, cards, resumes, endpoints] = await Promise.all([
    Mutation.find({ status: { $ne: "completed" }, updatedAt: { $lte: stale }, $or: [
      { creationSnapshot: { $ne: null }, "creationSnapshot.declined": { $ne: true } },
      { itemIncreaseSnapshot: { $ne: null } }, { decreaseRefundSnapshot: { $ne: null } },
      { addOnSnapshot: { $ne: null }, "addOnSnapshot.paymentIntent.status": { $ne: "requires_payment_method" } },
    ] })
      .select("_id operationId mutationType status createdAt lockedAt").lean(),
    InvoicePlan.find({ $or: [{ legacyReviewRequired: true }, { inventoryBlocked: true },
      { completedAt: null, createdAt: { $lte: new Date(now - 7200000) } }] })
      .select("_id subscription invoiceId inventoryBlocked legacyReviewRequired completedAt createdAt").lean(),
    Reservation.find({ state: "held" }).select("key subscription remaining createdAt").lean(),
    Customer.find({ $or: [{ paymentMethodOperation: { $ne: null } }, { stripeCustomerCreation: { $ne: null } }], updatedAt: { $lte: stale } }).select("_id +paymentMethodOperation +stripeCustomerCreation").lean(),
    Subscription.find({ "resumePaymentPlan.id": { $exists: true }, "resumePaymentPlan.completedAt": null,
      "resumePaymentPlan.startedAt": { $lte: stale } })
      .select("_id subscriptionNumber +resumePaymentPlan").lean(),
    listAllStripePages(params => stripe.webhookEndpoints.list(params), {}),
  ]);
  const endpointArg = process.argv.indexOf("--endpoint");
  const endpointCheck = checkSubscriptionEndpoints(endpoints, endpointArg >= 0 ? process.argv[endpointArg + 1] :
    process.env.STRIPE_SUBSCRIPTION_WEBHOOK_ENDPOINT_ID);
  console.log("RECOVERY_INTEGRITY", JSON.stringify({
    unresolvedOperations: mutations, invoicePlansNeedingReview: plans,
    heldInventory: reservations, savedCardOperations: cards.map(customer => ({ customerId: customer._id,
      operationId: (customer.paymentMethodOperation || customer.stripeCustomerCreation)?.id,
      startedAt: (customer.paymentMethodOperation || customer.stripeCustomerCreation)?.startedAt,
      kind: customer.stripeCustomerCreation ? "customer_identity" : "card" })),
    unfinishedResumes: resumes.map(subscription => ({ subscriptionId: subscription._id,
      planId: subscription.resumePaymentPlan.id, startedAt: subscription.resumePaymentPlan.startedAt })),
    webhookConfiguration: endpointCheck,
  }));
  let issues = mutations.length + plans.length + cards.length + resumes.length +
    Number(!endpointCheck.ok) + indexResults.filter(index => !index.ok).length;
  const pendingOrders = await Order.find({ status: "pending", archived: { $ne: true } }).select("items").lean();
  const expectedReserved = new Map();
  const add = item => expectedReserved.set(String(item.variant),
    (expectedReserved.get(String(item.variant)) || 0) + Number(item.quantity));
  for (const order of pendingOrders) for (const item of order.items || []) add(item);
  for (const reservation of reservations) for (const item of reservation.remaining || []) add(item);
  const variants = await Variant.find({}).select("_id stockQuantity reservedQuantity").lean();
  const stockDrift = variants.filter(variant => Number(variant.reservedQuantity || 0) !==
    (expectedReserved.get(String(variant._id)) || 0) || Number(variant.stockQuantity) < Number(variant.reservedQuantity || 0))
    .map(variant => ({ variantId: variant._id, stock: variant.stockQuantity, reserved: variant.reservedQuantity,
      expectedReserved: expectedReserved.get(String(variant._id)) || 0 }));
  const variantIds = new Set(variants.map(variant => String(variant._id)));
  const missingStockVariants = [...expectedReserved.keys()].filter(id => !variantIds.has(id));
  console.log("STOCK_INTEGRITY", JSON.stringify({ stockDrift, missingStockVariants }));
  issues += stockDrift.length + missingStockVariants.length;
  const subscriptions = await Subscription.find({})
    .sort({ createdAt: 1 })
    .lean();

  for (const subscription of subscriptions) {
    const [orders, deliveries, invoices, refundedPlans] = await Promise.all([
      Order.find({ subscription: subscription._id })
        .sort({ deliveryDate: 1 })
        .lean(),
      SubscriptionDelivery.find({ subscription: subscription._id })
        .sort({ scheduledDate: 1 })
        .lean(),
      subscription.stripeSubscriptionId
        ? listAllStripePages(params => stripe.invoices.list(params), {
            subscription: subscription.stripeSubscriptionId,
          })
        : Promise.resolve([]),
      InvoicePlan.find({ subscription: subscription._id, refundedAt: { $ne: null } }).select("invoiceId").lean(),
    ]);

    const days = effectiveDays(subscription);
    const ordersOutsideCurrentSchedule = orders.filter(
      (order) =>
        order.deliveryDate && !days.includes(londonWeekday(order.deliveryDate)),
    );
    const paidInvoices = invoices.filter(
      (invoice) => invoice.paid || invoice.status === "paid",
    );
    const linkedInvoiceIds = new Set(
      orders.map((order) => order.stripeInvoiceId).filter(Boolean),
    );
    const refundedInvoiceIds = new Set(refundedPlans.map(plan => plan.invoiceId));
    const unlinkedPaidInvoices = paidInvoices.filter(
      (invoice) => Number(invoice.amount_paid) > 0 && !linkedInvoiceIds.has(invoice.id) && !refundedInvoiceIds.has(invoice.id),
    );
    const duplicateSlotDates = [];
    const slotCounts = new Map();
    for (const delivery of deliveries) {
      const key = londonDateKey(delivery.scheduledDate);
      slotCounts.set(key, (slotCounts.get(key) || 0) + 1);
    }
    for (const [date, count] of slotCounts) {
      if (count > 1) duplicateSlotDates.push({ date, count });
    }

    const unaccountedSubscriptionOrderIds = orders.filter(order => order.deliveryStatus === "ordered" &&
      ["paid", "partially_refunded"].includes(order.status) &&
      !(order.subscriptionStockItems || []).length && !(order.subscriptionAddOnStockItems || []).length)
      .map(order => String(order._id));
    const heldDraftInvoiceIds = invoices.filter(invoice => invoice.status === "draft" && invoice.auto_advance === false &&
      Number(invoice.created) < now / 1000 - 7200).map(invoice => invoice.id);

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
        unaccountedSubscriptionOrderIds,
        heldDraftInvoiceIds,
      }),
    );
    issues += unlinkedPaidInvoices.length + duplicateSlotDates.length + unaccountedSubscriptionOrderIds.length + heldDraftInvoiceIds.length;
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
    issues += mismatches.length;
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

  console.log("AUDIT_RESULT", JSON.stringify({ ok: issues === 0, issues }));
  if (issues) process.exitCode = 2;
}

main().catch((error) => {
  console.error("Subscription integrity audit failed:", error.code || error.name);
  process.exitCode = 1;
}).finally(() => mongoose.disconnect());
