"use strict";

const express = require("express");
const { CONTROL_TOKEN } = require("./constants");
const fixtures = require("./fixture-factory");
const Subscription = require("../../models/subscription.model");
const stripe = require("../../utils/stripe.util");
const {
  reconcileSubscriptionPrice,
} = require("../../services/subscriptions/subscriptionPriceReconciliation.service");

const originalPriceCreate = stripe.prices.create.bind(stripe.prices);
let priceCreateFault = null;

function restoreStripePriceCreate() {
  stripe.prices.create = originalPriceCreate;
  priceCreateFault = null;
}

async function failNextStripePriceCreates(subscriptionId, requestedCount) {
  const subscription = await Subscription.findById(subscriptionId).lean();
  if (!subscription?.stripeProductId) {
    throw new Error("Subscription fixture has no Stripe product");
  }

  restoreStripePriceCreate();
  const count = Math.max(1, Math.min(Number(requestedCount) || 1, 10));
  priceCreateFault = {
    stripeProductId: subscription.stripeProductId,
    remaining: count,
  };

  stripe.prices.create = async (params, options) => {
    const shouldFail =
      priceCreateFault &&
      priceCreateFault.remaining > 0 &&
      params?.product === priceCreateFault.stripeProductId &&
      Boolean(params?.recurring);

    if (shouldFail) {
      priceCreateFault.remaining -= 1;
      const remaining = priceCreateFault.remaining;
      if (remaining === 0) {
        restoreStripePriceCreate();
      }
      throw new Error("Injected E2E Stripe recurring price creation failure");
    }

    return originalPriceCreate(params, options);
  };

  return { injected: true, count };
}

function asyncRoute(handler) {
  return async (req, res) => {
    try {
      const data = await handler(req);
      res.json({ success: true, data });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error?.message || "E2E control operation failed",
      });
    }
  };
}

function createControlApp() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ success: true, mode: "isolated-real-stripe-e2e" });
  });

  app.use((req, res, next) => {
    if (req.get("x-e2e-control-token") !== CONTROL_TOKEN) {
      return res.status(403).json({
        success: false,
        message: "Invalid E2E control token",
      });
    }
    return next();
  });

  app.post(
    "/reset",
    asyncRoute(async () => {
      restoreStripePriceCreate();
      await fixtures.reset();
      return { reset: true };
    }),
  );
  app.post(
    "/fixtures",
    asyncRoute((req) => fixtures.createFixture(req.body || {})),
  );
  app.get(
    "/emails",
    asyncRoute(async () => ({ emails: global.__E2E_EMAIL_OUTBOX__ || [] })),
  );
  app.delete(
    "/emails",
    asyncRoute(async () => {
      global.__E2E_EMAIL_OUTBOX__ = [];
      return { cleared: true };
    }),
  );
  app.post(
    "/reviews/:orderId/approve",
    asyncRoute((req) => fixtures.approveReview(req.params.orderId)),
  );
  app.get(
    "/state/:subscriptionId",
    asyncRoute((req) => fixtures.getState(req.params.subscriptionId)),
  );
  app.post(
    "/state/:subscriptionId/payment-outcome",
    asyncRoute((req) =>
      fixtures.setPaymentOutcome(
        req.params.subscriptionId,
        req.body?.outcome,
      ),
    ),
  );
  app.post(
    "/state/:subscriptionId/payment-retry/prepare",
    asyncRoute((req) =>
      fixtures.preparePaymentRetry(req.params.subscriptionId),
    ),
  );
  app.post(
    "/state/:subscriptionId/payment-retry/event",
    asyncRoute((req) =>
      fixtures.deliverSignedInvoiceEvent(
        req.params.subscriptionId,
        req.body?.type,
        req.body?.invoiceId,
      ),
    ),
  );
  app.post(
    "/state/:subscriptionId/cross-cutoff",
    asyncRoute((req) => fixtures.crossCutoff(req.params.subscriptionId)),
  );
  app.post(
    "/state/:subscriptionId/auto-resume",
    asyncRoute((req) => fixtures.autoResume(req.params.subscriptionId)),
  );
  app.post(
    "/state/:subscriptionId/finalize-cancellation",
    asyncRoute((req) =>
      fixtures.finalizeCancellation(
        req.params.subscriptionId,
        req.body?.referenceDate,
      ),
    ),
  );
  app.post(
    "/state/:subscriptionId/stripe-price-sync/fail-next",
    asyncRoute((req) =>
      failNextStripePriceCreates(req.params.subscriptionId, req.body?.count),
    ),
  );
  app.post(
    "/state/:subscriptionId/stripe-price-sync/reconcile",
    asyncRoute((req) => reconcileSubscriptionPrice(req.params.subscriptionId)),
  );

  return app;
}

module.exports = { createControlApp };
