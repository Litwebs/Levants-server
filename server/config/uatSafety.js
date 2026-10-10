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
  if (values.EMAIL_TRANSPORT !== "capture") fail("outbound email must be captured");
  if (values.UAT_EMAIL_OUTBOX !== "/srv/levants-uat/shared/email-outbox") fail("unexpected email capture path");
  if (values.UAT_STORAGE_MODE !== "disabled") fail("external storage must remain disabled");
  if (values.BACKGROUND_JOBS_ENABLED !== "false") fail("background jobs must remain disabled");
  if (values.STRIPE_SECRET_KEY !== "sk_test_uat_disabled") fail("payments must remain disabled until test credentials are provisioned");
  if (values.STRIPE_WEBHOOKS_ENABLED !== "false") fail("payment webhooks must remain disabled");
  for (const name of ["RESEND_API_KEY", "RESEND_EMAIL_KEY", "RESEND_URI", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "CLOUDINARY_URL", "OLD_STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY"]) {
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
