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
  SUBSCRIPTION_TIME_ZONE,
} = require("../utils/subscriptionCutoff.util");
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
const {
  withSchedulerLease,
} = require("../services/schedulerLease.service");

const RECONCILIATION_LEASE_MS = 30 * 60 * 1000;
const DAILY_MAINTENANCE_LEASE_MS = 3 * 60 * 60 * 1000;
const SCHEDULER_BATCH_SIZE = 100;

/**
 * ScheduleUpcomingSlots
 *
 * Runs daily to ensure active subscriptions have 3 upcoming delivery slots
 * pre-created in the SubscriptionDelivery collection (for UI visibility).
 */
async function ScheduleUpcomingSlots({ renewLease } = {}) {
  const reconciliation = await ReconcileRecentPaidSubscriptionInvoices();
  await renewLease?.();

  const priceReconciliation = await reconcileSubscriptionPrices({
    onlyPending: false,
    batchSize: SCHEDULER_BATCH_SIZE,
    onBatch: async () => {
      await renewLease?.();
    },
  });
  const finalized = await FinalizeScheduledCancellations();
  await renewLease?.();
  const resumed = await AutoResumePausedSubscriptions();
  await renewLease?.();

  let scheduled = 0;
  let afterId = null;
  while (true) {
    const filter = {
      status: "active",
      isCancellationScheduled: { $ne: true },
      ...(afterId ? { _id: { $gt: afterId } } : {}),
    };
    const subscriptions = await Subscription.find(filter)
      .sort({ _id: 1 })
      .limit(SCHEDULER_BATCH_SIZE)
      .exec();

    if (subscriptions.length === 0) break;

    for (const sub of subscriptions) {
      try {
        await scheduleUpcomingDeliveries(sub);
        scheduled += 1;
      } catch (err) {
        logger.error(
          `[SubscriptionCron] Failed to schedule slots for ${sub.subscriptionNumber}: ${err.message}`,
        );
      }
    }

    afterId = subscriptions.at(-1)._id;
    await renewLease?.();
    if (subscriptions.length < SCHEDULER_BATCH_SIZE) break;
  }

  logger.info(
    `[SubscriptionCron] Reconciled ${reconciliation.reconciled} missed invoices, checked ${priceReconciliation.checked} recurring prices in ${priceReconciliation.batches} batches (${priceReconciliation.repaired} repaired, ${priceReconciliation.pending} pending), finalized ${finalized} cancellations, auto-resumed ${resumed} paused subscriptions, and scheduled upcoming slots for ${scheduled} subscriptions`,
  );

  return {
    reconciliation,
    priceReconciliation,
    finalized,
    resumed,
    scheduled,
  };
}

function startSubscriptionGenerationCron() {
  // Pull-based safety net: an endpoint configuration mistake or a transient
  // delivery failure must not silently separate billing from fulfillment.
  cron.schedule("*/15 * * * *", async () => {
    try {
      const run = await withSchedulerLease(
        "subscription-reconciliation",
        async ({ renew }) => {
          await ReconcileRecentPaidSubscriptionInvoices();
          await renew();
          const priceReconciliation = await reconcileSubscriptionPrices({
            onlyPending: true,
            batchSize: SCHEDULER_BATCH_SIZE,
            onBatch: async () => {
              await renew();
            },
          });
          if (priceReconciliation.checked > 0) {
            logger.info(
              `[SubscriptionCron] Retried ${priceReconciliation.checked} pending recurring price syncs in ${priceReconciliation.batches} batches (${priceReconciliation.repaired} repaired, ${priceReconciliation.pending} still pending)`,
            );
          }
          return priceReconciliation;
        },
        { leaseMs: RECONCILIATION_LEASE_MS },
      );

      if (!run.acquired) {
        logger.info(
          "[SubscriptionCron] Reconciliation skipped because another instance owns the lease",
        );
      }
    } catch (err) {
      logger.error("[SubscriptionCron] Invoice/price reconciliation failed", err);
    }
  }, { timezone: SUBSCRIPTION_TIME_ZONE });

  // Run once daily at 06:00 to pre-schedule upcoming delivery slots and audit
  // every active recurring price. The full audit catches historical divergence
  // that predates the stripePriceSyncPending reliability marker.
  cron.schedule("0 6 * * *", async () => {
    try {
      const run = await withSchedulerLease(
        "subscription-daily-maintenance",
        async ({ renew }) => {
          await VerifySubscriptionWebhookConfiguration();
          await renew();
          return ScheduleUpcomingSlots({ renewLease: renew });
        },
        { leaseMs: DAILY_MAINTENANCE_LEASE_MS },
      );

      if (!run.acquired) {
        logger.info(
          "[SubscriptionCron] Daily maintenance skipped because another instance owns the lease",
        );
      }
    } catch (err) {
      logger.error("[SubscriptionCron] Slot scheduling cron failed", err);
    }
  }, { timezone: SUBSCRIPTION_TIME_ZONE });

  logger.cron(
    `Subscription invoice/price reconciliation (15 min) and slot scheduling + full price audit (daily 06:00 ${SUBSCRIPTION_TIME_ZONE})`,
  );
}

module.exports = {
  ScheduleUpcomingSlots,
  startSubscriptionGenerationCron,
};
