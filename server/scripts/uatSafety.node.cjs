const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateUatEnvironment } = require("../config/uatSafety");

function safe() {
  const values = {
    APP_ENV: "uat", LEVANTS_REQUIRE_UAT: "1", NODE_ENV: "production",
    MONGO_URI: "mongodb://levants_uat_app:example@127.0.0.1:27018/levants_uat?authSource=levants_uat&replicaSet=levants-uat",
    PORT: "5002", HOST: "127.0.0.1", EMAIL_TRANSPORT: "capture",
    UAT_EMAIL_OUTBOX: "/srv/levants-uat/shared/email-outbox", UAT_STORAGE_MODE: "disabled",
    BACKGROUND_JOBS_ENABLED: "false", STRIPE_SECRET_KEY: "sk_test_uat_disabled", STRIPE_WEBHOOKS_ENABLED: "false",
  };
  for (const name of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "JWT_2FA_SECRET", "JWT_CUSTOMER_ACCESS_SECRET", "JWT_CUSTOMER_REFRESH_SECRET", "CREDENTIALS_MASTER_KEY"]) values[name] = "test-only-".repeat(8);
  for (const name of ["FRONTEND_URL_PROD", "CLIENT_FRONT_URL_PROD", "CUSTOMER_PORTAL_URL_PROD"]) values[name] = "https://uat-api.levantsdairy.co.uk";
  return values;
}

test("accepts dedicated UAT configuration", () => validateUatEnvironment(safe()));
test("leaves ordinary production configuration alone", () => validateUatEnvironment({ NODE_ENV: "production" }));
test("rejects wrong database, service, integration and origin settings", () => {
  const changes = {
    APP_ENV: "production", MONGO_URI: "mongodb://example@127.0.0.1:27017/production",
    PORT: "5001", HOST: "0.0.0.0", EMAIL_TRANSPORT: "resend", UAT_STORAGE_MODE: "enabled",
    BACKGROUND_JOBS_ENABLED: "true", STRIPE_SECRET_KEY: "sk_live_example", RESEND_API_KEY: "example",
    CLOUDINARY_API_SECRET: "example", FRONTEND_URL_PROD: "https://api.levantsdairy.co.uk", JWT_ACCESS_SECRET: "short",
  };
  for (const [name, value] of Object.entries(changes)) {
    assert.throws(() => validateUatEnvironment({ ...safe(), [name]: value }), /UAT|requires/, name);
  }
});
