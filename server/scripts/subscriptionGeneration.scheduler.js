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
  FinalizeScheduledCancellations,
  scheduleUpcomingDeliveries,
} = require("../services/customerPortal/customerSubscriptions.service");
const {
  ReconcileRecentPaidSubscriptionInvoices,
  VerifySubscriptionWebhookConfiguration,
} = require("../services/subscriptions/subscriptionWebhook.service");
const {
  reconcileSubscriptionPrices,
} = require("../services/subscriptions/subscriptionPriceReconciliation.service");

/**
 * ScheduleUpcomingSlots
 *
 * Runs daily to ensure active subscriptions have 3 upcoming delivery slots
 * pre-created in the SubscriptionDelivery collection (for UI visibility).
 */
async function ScheduleUpcomingSlots() {
  const reconciliation = await ReconcileRecentPaidSubscriptionInvoices();
  const priceReconciliation = await reconcileSubscriptionPrices({
    onlyPending: false,
    limit: 500,
  });
  const finalized = await FinalizeScheduledCancellations();
  const resumed = await AutoResumePausedSubscriptions();
  const subscriptions = await Subscription.find({
    status: "active",
    isCancellationScheduled: { $ne: true },
  });
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
    `[SubscriptionCron] Reconciled ${reconciliation.reconciled} missed invoices, checked ${priceReconciliation.checked} recurring prices (${priceReconciliation.repaired} repaired, ${priceReconciliation.pending} pending), finalized ${finalized} cancellations, auto-resumed ${resumed} paused subscriptions, and scheduled upcoming slots for ${scheduled} subscriptions`,
  );
}

function startSubscriptionGenerationCron() {
  // Pull-based safety net: an endpoint configuration mistake or a transient
  // delivery failure must not silently separate billing from fulfillment.
  cron.schedule("*/15 * * * *", async () => {
    try {
      await ReconcileRecentPaidSubscriptionInvoices();
      const priceReconciliation = await reconcileSubscriptionPrices({
        onlyPending: true,
        limit: 200,
      });
      if (priceReconciliation.checked > 0) {
        logger.info(
          `[SubscriptionCron] Retried ${priceReconciliation.checked} pending recurring price syncs (${priceReconciliation.repaired} repaired, ${priceReconciliation.pending} still pending)`,
        );
      }
    } catch (err) {
      logger.error("[SubscriptionCron] Invoice/price reconciliation failed", err);
    }
  });

  // Run once daily at 06:00 to pre-schedule upcoming delivery slots and audit
  // every active recurring price. The full audit catches historical divergence
  // that predates the stripePriceSyncPending reliability marker.
  cron.schedule("0 6 * * *", async () => {
    try {
      await VerifySubscriptionWebhookConfiguration();
      await ScheduleUpcomingSlots();
    } catch (err) {
      logger.error("[SubscriptionCron] Slot scheduling cron failed", err);
    }
  });

  logger.cron(
    "Subscription invoice/price reconciliation (15 min) and slot scheduling + full price audit (daily 06:00)",
  );
}

module.exports = {
  ScheduleUpcomingSlots,
  startSubscriptionGenerationCron,
};
