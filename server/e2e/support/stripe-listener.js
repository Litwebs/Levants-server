"use strict";

const { spawn } = require("child_process");

const EVENTS = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
  "charge.refunded",
  "refund.created",
  "refund.updated",
].join(",");

async function startStripeListener({ secretKey, forwardTo }) {
  if (process.env.E2E_USE_STRIPE_CLI !== "1") {
    return { child: null, signingSecret: process.env.STRIPE_WEBHOOK_SECRET };
  }

  const child = spawn(
    "stripe",
    [
      "listen",
      "--events",
      EVENTS,
      "--forward-to",
      forwardTo,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, STRIPE_API_KEY: secretKey },
    },
  );

  let buffered = "";
  const signingSecret = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
      reject(
        new Error(
          "Stripe CLI did not become ready within 45 seconds. " +
            "Run `stripe login`, or set E2E_USE_STRIPE_CLI=0 for the non-webhook matrix lane.",
        ),
      );
    }, 45_000);

    const onData = (chunk) => {
      buffered = `${buffered}${String(chunk)}`.slice(-16_000);
      const match = buffered.match(/whsec_[A-Za-z0-9]+/);
      if (!match) return;
      clearTimeout(timeout);
      resolve(match[0]);
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Stripe CLI exited before becoming ready (code ${code}). ` +
            "Its output was withheld because it can contain a webhook secret.",
        ),
      );
    });
  });

  child.stdout.removeAllListeners("data");
  child.stderr.removeAllListeners("data");
  child.stdout.on("data", () => {});
  child.stderr.on("data", () => {});

  return { child, signingSecret };
}

function stopStripeListener(listener) {
  if (!listener?.child || listener.child.killed) return;
  listener.child.kill("SIGTERM");
}

module.exports = {
  startStripeListener,
  stopStripeListener,
};
