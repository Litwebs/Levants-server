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
