"use strict";

function uatStripeOptions() {
  if (process.env.APP_ENV !== "uat") return {};
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
