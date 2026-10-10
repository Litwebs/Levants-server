"use strict";

function validateUatEnvironment(values = process.env) {
  if (values.LEVANTS_REQUIRE_UAT === "1" && values.APP_ENV !== "uat") {
    throw new Error("This service requires APP_ENV=uat");
  }
  if (values.APP_ENV !== "uat") return;
  const fail = (message) => { throw new Error(`UAT safety: ${message}`); };
  let uri;
  try { uri = new URL(values.MONGO_URI); } catch { fail("invalid database configuration"); }
  if (uri.protocol !== "mongodb:" || uri.hostname !== "127.0.0.1" ||
      uri.port !== "27018" || uri.pathname !== "/levants_uat" ||
      uri.username !== "levants_uat_app" ||
      uri.searchParams.get("authSource") !== "levants_uat" ||
      uri.searchParams.get("replicaSet") !== "levants-uat") {
    fail("database must be the dedicated local UAT instance and user");
  }
  if (values.NODE_ENV !== "production") fail("NODE_ENV must be production");
  if (values.PORT !== "5002" || values.HOST !== "127.0.0.1") fail("unexpected API binding");
  if (values.EMAIL_TRANSPORT === "resend") {
    if (!/^re_[A-Za-z0-9_\-]+$/.test(values.RESEND_EMAIL_KEY || "")) fail("UAT email requires its separate Resend key");
  } else {
    if (values.EMAIL_TRANSPORT !== "capture") fail("unknown email transport");
    if (values.RESEND_EMAIL_KEY) fail("capture mode must not contain a sending key");
  }
  if (values.UAT_EMAIL_OUTBOX !== "/srv/levants-uat/shared/email-outbox") fail("unexpected email capture path");
  if (values.UAT_STORAGE_MODE === "cloudinary") {
    if (!/^[A-Za-z0-9_-]+$/.test(values.CLOUDINARY_CLOUD_NAME || "") ||
        !/^[0-9]+$/.test(values.CLOUDINARY_API_KEY || "") ||
        !/^[A-Za-z0-9_-]+$/.test(values.CLOUDINARY_API_SECRET || "")) fail("valid Cloudinary settings are required");
  } else {
    if (values.UAT_STORAGE_MODE !== "disabled") fail("unknown storage mode");
    if (values.CLOUDINARY_API_KEY || values.CLOUDINARY_API_SECRET) fail("disabled storage must not contain Cloudinary credentials");
  }
  if (values.UAT_GOOGLE_MODE === "enabled") {
    if (!/^[A-Za-z0-9_-]+$/.test(values.GOOGLE_MAPS_API_KEY || "") ||
        !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(values.GOOGLE_PROJECT_ID || "")) fail("valid Google settings are required");
    if (values.GOOGLE_APPLICATION_CREDENTIALS !== "/etc/levants-uat/google-service-account.json") fail("Google credentials must use the protected UAT copy");
  } else if (values.UAT_GOOGLE_MODE && values.UAT_GOOGLE_MODE !== "disabled") fail("unknown Google mode");
  if (!["false", "true"].includes(values.BACKGROUND_JOBS_ENABLED)) fail("background job setting must be explicit");
  if (values.BACKGROUND_JOBS_ENABLED === "true" &&
      (values.UAT_STRIPE_MODE !== "test" || values.STRIPE_WEBHOOKS_ENABLED !== "true")) {
    fail("UAT background jobs require Stripe sandbox mode and webhooks");
  }
  if (values.UAT_STRIPE_MODE === "test") {
    if (!/^sk_test_[A-Za-z0-9]+$/.test(values.STRIPE_SECRET_KEY || "")) fail("Stripe requires a sandbox secret key");
    if (!/^pk_test_[A-Za-z0-9]+$/.test(values.STRIPE_PUBLISHABLE_KEY || "")) fail("Stripe requires a sandbox publishable key");
    if (!/^whsec_[A-Za-z0-9]+$/.test(values.STRIPE_WEBHOOK_SECRET || "")) fail("Stripe requires its UAT webhook signing secret");
    if (values.STRIPE_WEBHOOKS_ENABLED !== "true") fail("sandbox webhooks must be enabled");
  } else {
    if (values.UAT_STRIPE_MODE && values.UAT_STRIPE_MODE !== "disabled") fail("unknown Stripe mode");
    if (values.STRIPE_SECRET_KEY !== "sk_test_uat_disabled" || values.STRIPE_PUBLISHABLE_KEY) fail("payments must remain disabled until test credentials are provisioned");
    if (values.STRIPE_WEBHOOKS_ENABLED !== "false") fail("payment webhooks must remain disabled");
  }
  for (const name of ["RESEND_API_KEY", "RESEND_URI", "CLOUDINARY_URL", "OLD_STRIPE_SECRET_KEY"]) {
    if (values[name]) fail(`${name} must not be configured in isolated mode`);
  }
  for (const name of ["JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET", "JWT_2FA_SECRET", "JWT_CUSTOMER_ACCESS_SECRET", "JWT_CUSTOMER_REFRESH_SECRET", "CREDENTIALS_MASTER_KEY"]) {
    if (!values[name] || values[name].length < 32) fail(`${name} must be independently generated`);
  }
  for (const name of ["FRONTEND_URL_PROD", "CLIENT_FRONT_URL_PROD", "CUSTOMER_PORTAL_URL_PROD"]) {
    if (values[name] !== "https://uat-api.levantsdairy.co.uk") fail(`${name} must use the UAT origin`);
  }
}

module.exports = { validateUatEnvironment };
