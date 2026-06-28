"use strict";

/**
 * Subscription Slot Scheduler
 *
 * NOTE: Order generation is now driven by Stripe's invoice.payment_succeeded
 * webhook (see services/subscriptions/subscriptionWebhook.service.js).
 * This cron only pre-creates SubscriptionDelivery slot records for UI
 * visibility — it does NOT charge customers or create Orders.
 */

const cron = require("node-cron");
const Subscription = require("../models/subscription.model");
const logger = require("../utils/logger.util");
const {
  AutoResumePausedSubscriptions,
  scheduleUpcomingDeliveries,
} = require("../services/customerPortal/customerSubscriptions.service");

/**
 * ScheduleUpcomingSlots
 *
 * Runs daily to ensure active subscriptions have 3 upcoming delivery slots
 * pre-created in the SubscriptionDelivery collection (for UI visibility).
 */
async function ScheduleUpcomingSlots() {
  const resumed = await AutoResumePausedSubscriptions();
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
    `[SubscriptionCron] Auto-resumed ${resumed} paused subscriptions and scheduled upcoming slots for ${scheduled} subscriptions`,
  );
}

function startSubscriptionGenerationCron() {
  // Run once daily at 06:00 to pre-schedule upcoming delivery slots
  cron.schedule("0 6 * * *", async () => {
    try {
      await ScheduleUpcomingSlots();
    } catch (err) {
      logger.error("[SubscriptionCron] Slot scheduling cron failed", err);
    }
  });

  logger.cron("Subscription slot scheduling (daily 06:00)");
}

module.exports = {
  ScheduleUpcomingSlots,
  startSubscriptionGenerationCron,
};
