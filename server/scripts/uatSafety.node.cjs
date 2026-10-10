const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateUatEnvironment } = require("../config/uatSafety");
const fs = require("node:fs");
const { createEmailTransport } = require("../Integration/emailTransport");
const { uatStripeOptions } = require("../utils/uatStripeOptions");

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

test("UAT captures individual and batch messages without loading an email provider", async (t) => {
  const original = { ...process.env };
  t.after(() => { process.env = original; });
  process.env.APP_ENV = "uat";
  process.env.UAT_EMAIL_OUTBOX = "/srv/levants-uat/shared/email-outbox";
  t.mock.method(fs, "mkdirSync", () => {});
  t.mock.method(fs, "readdirSync", () => []);
  const writes = [];
  t.mock.method(fs, "writeFileSync", (file, content, options) => writes.push({ file, content, options }));
  const transport = createEmailTransport();
  await transport.emails.send({ to: "synthetic@example.invalid", subject: "test" });
  const batch = await transport.batch.send([{ to: "synthetic@example.invalid" }]);
  assert.equal(batch.data.length, 1);
  assert.equal(writes.length, 2);
  assert.equal(writes[0].options.mode, 0o600);
  assert.equal(JSON.parse(writes[0].content).subject, "test");
  process.env.UAT_EMAIL_OUTBOX = "/tmp/unsafe";
  await assert.rejects(transport.emails.send({}), /Invalid UAT outbox/);
});

test("UAT payment transport refuses provider requests", async (t) => {
  const original = process.env.APP_ENV;
  t.after(() => { if (original === undefined) delete process.env.APP_ENV; else process.env.APP_ENV = original; });
  process.env.APP_ENV = "uat";
  await assert.rejects(uatStripeOptions().httpClient.makeRequest(), /Payments are disabled/);
  process.env.APP_ENV = "production";
  assert.deepEqual(uatStripeOptions(), {});
});
