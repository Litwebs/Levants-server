"use strict";

//test

const express = require("express");
const { CONTROL_TOKEN } = require("./constants");
const fixtures = require("./fixture-factory");

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
      await fixtures.reset();
      return { reset: true };
    }),
  );
  app.post(
    "/fixtures",
    asyncRoute((req) => fixtures.createFixture(req.body || {})),
  );
  app.post(
    "/deals/fixtures",
    asyncRoute((req) => fixtures.createDealsFixture(req.body || {})),
  );
  app.get(
    "/deals/admin",
    asyncRoute((req) =>
      fixtures.e2eAdminListDeals({
        page: Number(req.query.page || 1),
        pageSize: Number(req.query.pageSize || 20),
        featured: req.query.featured,
      }),
    ),
  );
  app.post(
    "/deals/admin",
    asyncRoute((req) => fixtures.e2eAdminCreateDeal(req.body || {})),
  );
  app.patch(
    "/deals/admin/:dealId",
    asyncRoute((req) =>
      fixtures.e2eAdminUpdateDeal(req.params.dealId, req.body || {}),
    ),
  );
  app.delete(
    "/deals/admin/:dealId",
    asyncRoute((req) => fixtures.e2eAdminDeactivateDeal(req.params.dealId)),
  );
  app.post(
    "/deals/admin/:dealId/archive",
    asyncRoute((req) => fixtures.e2eAdminArchiveDeal(req.params.dealId)),
  );
  app.get(
    "/deals/admin-variants",
    asyncRoute((req) =>
      fixtures.e2eAdminSearchVariants({
        q: req.query.q,
        limit: Number(req.query.limit || 10),
      }),
    ),
  );
  app.get(
    "/deals/admin-orders",
    asyncRoute((req) => fixtures.e2eAdminListOrders(req.query || {})),
  );
  app.get(
    "/deals/admin-orders/:orderId",
    asyncRoute((req) => fixtures.e2eAdminGetOrder(req.params.orderId)),
  );
  app.get(
    "/deals/state/:customerId",
    asyncRoute((req) => fixtures.getDealsState(req.params.customerId)),
  );
  app.post(
    "/deals/mutate",
    asyncRoute((req) => fixtures.mutateDealsFixture(req.body || {})),
  );
  app.post(
    "/deals/checkout/:sessionId/redeliver",
    asyncRoute((req) =>
      fixtures.redeliverDealCheckoutCompleted(req.params.sessionId),
    ),
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

  return app;
}

module.exports = { createControlApp };
