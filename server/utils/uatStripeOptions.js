"use strict";

function uatStripeOptions() {
  if (process.env.APP_ENV !== "uat") return {};
  if (process.env.UAT_STRIPE_MODE === "test") {
    if (!/^sk_test_[A-Za-z0-9]+$/.test(process.env.STRIPE_SECRET_KEY || "")) {
      throw new Error("UAT Stripe requires a sandbox key");
    }
    return { maxNetworkRetries: 2, timeout: 20000, telemetry: false };
  }
  return {
    httpClient: {
      getClientName: () => "uat-payments-disabled",
      makeRequest: async () => {
        const error = new Error("Payments are disabled in isolated UAT");
        error.statusCode = 503;
        throw error;
      },
    },
    maxNetworkRetries: 0,
  };
}

module.exports = { uatStripeOptions };
