"use strict";

const cron = require("node-cron");
const mongoose = require("mongoose");
const Subscription = require("../models/subscription.model");
const SubscriptionDelivery = require("../models/subscriptionDelivery.model");
const Order = require("../models/order.model");
const Customer = require("../models/customer.model");
const Payment = require("../models/payment.model");
const CustomerNotification = require("../models/customerNotification.model");
const logger = require("../utils/logger.util");
const {
  addFrequencyDays,
  scheduleUpcomingDeliveries,
} = require("../services/customerPortal/customerSubscriptions.service");

/**
 * GenerateSubscriptionOrders
 *
 * Finds all active subscriptions with a nextDeliveryDate <= now,
 * creates an Order from the subscription items, marks the delivery slot
 * as "generated", and advances nextDeliveryDate.
 *
 * Safe to run multiple times (idempotent via the SubscriptionDelivery check).
 */
async function GenerateSubscriptionOrders() {
  const now = new Date();
  logger.info("[SubscriptionCron] Starting subscription order generation…");

  // Find active subscriptions due for a delivery
  const dueSubscriptions = await Subscription.find({
    status: "active",
    nextDeliveryDate: { $lte: now },
  }).populate("customer");

  let generated = 0;
  let skipped = 0;
  let errored = 0;

  for (const subscription of dueSubscriptions) {
    try {
      // Check for an existing SubscriptionDelivery slot for this date
      const deliverySlot = await SubscriptionDelivery.findOne({
        subscription: subscription._id,
        scheduledDate: {
          $gte: new Date(
            subscription.nextDeliveryDate.getTime() - 12 * 60 * 60 * 1000,
          ),
          $lte: new Date(
            subscription.nextDeliveryDate.getTime() + 12 * 60 * 60 * 1000,
          ),
        },
      });

      // Avoid duplicates: skip if order already generated for this slot
      if (deliverySlot && deliverySlot.status === "generated") {
        skipped++;
        continue;
      }

      // Build order items from subscription items
      const orderItems = subscription.items.map((item) => ({
        product: item.product,
        variant: item.variant,
        name: item.name,
        sku: item.sku,
        price: item.unitPrice,
        quantity: item.quantity,
        subtotal: item.unitPrice * item.quantity,
      }));

      const subtotal = orderItems.reduce((sum, i) => sum + i.subtotal, 0);
      const total = subtotal; // delivery fee can be added later

      const reservationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // We need a location for the order – use a placeholder since subscription addresses
      // may not have been geocoded. Use { lat: 0, lng: 0 } as fallback.
      let location = { lat: 0, lng: 0 };
      try {
        const { geocodeAddress } = require("../Integration/google.geocode");
        location = await geocodeAddress(subscription.deliveryAddress);
      } catch {
        // Non-fatal – use fallback coords
      }

      const order = await Order.create({
        customer: subscription.customer._id,
        items: orderItems,
        deliveryAddress: {
          line1: subscription.deliveryAddress.line1,
          line2: subscription.deliveryAddress.line2 || null,
          city: subscription.deliveryAddress.city,
          postcode: subscription.deliveryAddress.postcode,
          country: subscription.deliveryAddress.country,
        },
        customerInstructions:
          subscription.deliveryAddress.deliveryInstructions || "",
        location,
        deliveryDate: new Date(subscription.nextDeliveryDate),
        deliveryFee: 0,
        subtotal,
        total,
        status: "pending",
        deliveryStatus: "ordered",
        orderType: "subscription_generated",
        subscription: subscription._id,
        reservationExpiresAt,
      });

      // Create payment record
      await Payment.create({
        customer: subscription.customer._id,
        order: order._id,
        subscription: subscription._id,
        amount: total,
        status: "pending",
      });

      // Mark delivery slot as generated
      if (deliverySlot) {
        deliverySlot.status = "generated";
        deliverySlot.order = order._id;
        deliverySlot.generatedAt = new Date();
        await deliverySlot.save();
      } else {
        // Create and mark slot
        await SubscriptionDelivery.create({
          subscription: subscription._id,
          customer: subscription.customer._id,
          order: order._id,
          scheduledDate: subscription.nextDeliveryDate,
          status: "generated",
          generatedAt: new Date(),
        });
      }

      // Advance nextDeliveryDate
      subscription.nextDeliveryDate = addFrequencyDays(
        subscription.nextDeliveryDate,
        subscription.frequency,
      );
      await subscription.save();

      // Schedule next upcoming delivery slots
      await scheduleUpcomingDeliveries(subscription);

      // Notify customer
      await CustomerNotification.create({
        customer: subscription.customer._id,
        type: "subscription_upcoming_delivery",
        title: "Upcoming subscription delivery",
        message: `Your subscription order #${order.orderId} has been created for ${new Date(order.deliveryDate).toLocaleDateString("en-GB")}.`,
        relatedOrder: order._id,
        relatedSubscription: subscription._id,
      });

      logger.info(
        `[SubscriptionCron] Generated order ${order.orderId} for subscription ${subscription.subscriptionNumber}`,
      );
      generated++;
    } catch (err) {
      logger.error(
        `[SubscriptionCron] Failed to generate order for subscription ${subscription.subscriptionNumber}: ${err.message}`,
      );
      errored++;
    }
  }

  logger.info(
    `[SubscriptionCron] Done. Generated: ${generated}, Skipped: ${skipped}, Errors: ${errored}`,
  );

  return { generated, skipped, errored };
}

/**
 * ScheduleUpcomingSlots
 *
 * Runs daily to ensure active subscriptions have upcoming delivery slots
 * pre-created in SubscriptionDelivery collection (for visibility).
 */
async function ScheduleUpcomingSlots() {
  const subscriptions = await Subscription.find({ status: "active" });
  let scheduled = 0;

  for (const sub of subscriptions) {
    try {
      await scheduleUpcomingDeliveries(sub);
      scheduled++;
    } catch (err) {
      logger.error(
        `[SubscriptionCron] Failed to schedule slots for ${sub.subscriptionNumber}: ${err.message}`,
      );
    }
  }

  logger.info(
    `[SubscriptionCron] Scheduled upcoming slots for ${scheduled} subscriptions`,
  );
}

function startSubscriptionGenerationCron() {
  // Run every hour to generate orders for due subscriptions
  cron.schedule("0 * * * *", async () => {
    try {
      await GenerateSubscriptionOrders();
    } catch (err) {
      logger.error("[SubscriptionCron] Cron job failed", err);
    }
  });

  // Run once daily at 06:00 to pre-schedule upcoming delivery slots
  cron.schedule("0 6 * * *", async () => {
    try {
      await ScheduleUpcomingSlots();
    } catch (err) {
      logger.error("[SubscriptionCron] Slot scheduling cron failed", err);
    }
  });

  logger.cron("Subscription order generation (hourly)");
  logger.cron("Subscription slot scheduling (daily 06:00)");
}

module.exports = {
  GenerateSubscriptionOrders,
  ScheduleUpcomingSlots,
  startSubscriptionGenerationCron,
};
