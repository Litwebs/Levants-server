"use strict";

const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
const {
  API_ORIGIN,
  API_PORT,
  CONTROL_PORT,
  HOST,
} = require("./constants");
const { configureSafeEnvironment, SERVER_ROOT } = require("./safe-environment");
const { startStripeListener, stopStripeListener } = require("./stripe-listener");

let replicaSet;
let apiServer;
let controlServer;
let stripeListener;
let fixtureFactory;
let shuttingDown = false;
let isolatedWorkingDirectory;

async function listen(server, port) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, resolve);
  });
}

async function close(server) {
  if (!server?.listening) return;
  await new Promise((resolve) => server.close(resolve));
}

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopStripeListener(stripeListener);
  await close(controlServer);
  await close(apiServer);
  if (fixtureFactory) {
    await fixtureFactory.reset().catch((error) => {
      process.stderr.write(`[e2e] cleanup warning: ${error.message}\n`);
    });
  }
  await mongoose.disconnect().catch(() => {});
  await replicaSet?.stop().catch(() => {});
  if (isolatedWorkingDirectory) {
    fs.rmSync(isolatedWorkingDirectory, { recursive: true, force: true });
  }
  process.exit(exitCode);
}

async function start() {
  const { secretKey } = configureSafeEnvironment();

  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const mongoUri = replicaSet.getUri("levants-real-stripe-e2e");
  process.env.MONGO_URI = mongoUri;
  process.env.MONGO_URI_TEST = mongoUri;
  await mongoose.connect(mongoUri, { autoIndex: true });

  stripeListener = await startStripeListener({
    secretKey,
    forwardTo: `${API_ORIGIN}/api/webhooks/stripe`,
  });
  if (stripeListener.signingSecret) {
    process.env.STRIPE_WEBHOOK_SECRET = stripeListener.signingSecret;
  }

  // config/env.js loads `.env` with override:true from process.cwd(). Requiring
  // the actual app from a unique empty directory prevents any repository or
  // ambient /tmp env file from replacing the validated test-only Stripe keys
  // and isolated Mongo URI above.
  isolatedWorkingDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "levants-real-stripe-e2e-"),
  );
  process.chdir(isolatedWorkingDirectory);

  // The fixture factory reshapes the initial subscription schedule into exact
  // test dates. Do not let the asynchronously forwarded, signed initial invoice
  // webhook race that rewrite. Observe the real HTTP response here (rather
  // than the service method, which is also called by the synchronous fallback)
  // so fixtures can wait specifically for successful Stripe CLI delivery.
  global.__E2E_COMPLETED_SIGNED_INVOICE_WEBHOOKS__ = new Set();
  const stripeWebhookController = require(
    `${SERVER_ROOT}/controllers/stripe.webhook.controller`,
  );
  const handleStripeWebhook = stripeWebhookController.HandleStripeWebhook;
  stripeWebhookController.HandleStripeWebhook = async function observedWebhook(
    req,
    res,
  ) {
    let invoiceId = null;
    try {
      const event = JSON.parse(Buffer.from(req.body).toString("utf8"));
      if (event?.type === "invoice.payment_succeeded") {
        invoiceId = event.data?.object?.id || null;
      }
    } catch {
      // Signature validation in the real controller remains authoritative.
    }

    if (invoiceId) {
      res.once("finish", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          global.__E2E_COMPLETED_SIGNED_INVOICE_WEBHOOKS__.add(invoiceId);
        }
      });
    }

    return handleStripeWebhook(req, res);
  };

  const app = require(`${SERVER_ROOT}/app`);
  fixtureFactory = require(`${SERVER_ROOT}/e2e/support/fixture-factory`);
  const { createControlApp } = require(`${SERVER_ROOT}/e2e/support/control-app`);

  apiServer = http.createServer(app);
  controlServer = http.createServer(createControlApp());
  await Promise.all([
    listen(apiServer, API_PORT),
    listen(controlServer, CONTROL_PORT),
  ]);

  process.stdout.write(
    `[e2e] isolated API and control servers ready (Stripe CLI ${
      stripeListener.child ? "enabled" : "disabled"
    })\n`,
  );
}

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));
process.on("uncaughtException", (error) => {
  process.stderr.write(`[e2e] fatal: ${error.message}\n`);
  void shutdown(1);
});
process.on("unhandledRejection", (error) => {
  process.stderr.write(`[e2e] rejected: ${error?.message || error}\n`);
  void shutdown(1);
});

start().catch((error) => {
  process.stderr.write(`[e2e] startup failed: ${error.message}\n`);
  void shutdown(1);
});
