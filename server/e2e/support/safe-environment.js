"use strict";

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const {
  API_PORT,
  CLIENT_ORIGIN,
  CONTROL_TOKEN,
} = require("./constants");

const SERVER_ROOT = path.resolve(__dirname, "../..");

function readSourceEnvironment() {
  const envPath = process.env.E2E_ENV_FILE
    ? path.resolve(process.env.E2E_ENV_FILE)
    : path.join(SERVER_ROOT, ".env");

  if (!fs.existsSync(envPath)) {
    throw new Error(
      `Real-Stripe E2E requires an env file at ${envPath}. ` +
        "Set E2E_ENV_FILE to use a different test-only file.",
    );
  }

  return dotenv.parse(fs.readFileSync(envPath));
}

function configureSafeEnvironment() {
  const source = readSourceEnvironment();
  const secretKey = process.env.STRIPE_SECRET_KEY || source.STRIPE_SECRET_KEY;
  const publishableKey =
    process.env.STRIPE_PUBLISHABLE_KEY || source.STRIPE_PUBLISHABLE_KEY;

  if (!secretKey?.startsWith("sk_test_")) {
    throw new Error(
      "Refusing to run: STRIPE_SECRET_KEY must be a Stripe test-mode key (sk_test_...).",
    );
  }
  if (!publishableKey?.startsWith("pk_test_")) {
    throw new Error(
      "Refusing to run: STRIPE_PUBLISHABLE_KEY must be a Stripe test-mode key (pk_test_...).",
    );
  }

  const copiedNames = [
    "JWT_ACCESS_SECRET",
    "JWT_REFRESH_SECRET",
    "JWT_ACCESS_EXPIRES_IN",
    "JWT_REFRESH_EXPIRES_IN",
    "STRIPE_API_VERSION",
    "STRIPE_DEFAULT_CURRENCY",
  ];
  for (const name of copiedNames) {
    if (!process.env[name] && source[name]) process.env[name] = source[name];
  }

  process.env.STRIPE_SECRET_KEY = secretKey;
  process.env.STRIPE_PUBLISHABLE_KEY = publishableKey;
  process.env.STRIPE_WEBHOOK_SECRET =
    process.env.STRIPE_WEBHOOK_SECRET ||
    source.STRIPE_WEBHOOK_SECRET ||
    "whsec_e2e_listener_not_started";
  process.env.NODE_ENV = "development";
  process.env.PORT = String(API_PORT);
  process.env.FRONTEND_URL_DEV = CLIENT_ORIGIN;
  process.env.CLIENT_FRONT_URL_DEV = CLIENT_ORIGIN;
  process.env.RATE_LIMIT_LOGIN_MAX = "1000";
  process.env.RATE_LIMIT_AUTH_MAX = "5000";
  process.env.RATE_LIMIT_API_MAX = "5000";
  process.env.E2E_CONTROL_TOKEN = CONTROL_TOKEN;
  // Several notification modules construct Resend eagerly at require-time.
  // Portal subscription E2E customers are pre-verified and these scenarios do
  // not send email, so use a deliberately non-working test placeholder rather
  // than loading a production mail key into the isolated stack.
  process.env.RESEND_URI = "re_e2e_never_send";
  process.env.RESEND_EMAIL_KEY = "re_e2e_never_send";
  process.env.E2E_CAPTURE_EMAILS = "1";
  process.env.TZ = process.env.TZ || "Europe/London";

  return { source, secretKey, publishableKey };
}

module.exports = {
  SERVER_ROOT,
  configureSafeEnvironment,
};
