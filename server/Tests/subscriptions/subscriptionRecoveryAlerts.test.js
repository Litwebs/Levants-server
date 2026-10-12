"use strict";
const mongoose = require("mongoose");
const Alert = require("../../models/subscriptionRecoveryAlert.model");
const { notifySubscriptionRecovery: notify } = require("../../services/subscriptions/subscriptionRecoveryAlerts.service");
let savedEnvironment;
const report = () => ({ mutations: [{ _id: new mongoose.Types.ObjectId(), operationId: "stuck-op", mutationType: "create_subscription", email: "private@example.com", request: { card: "never include" } }] });
const options = send => ({ send, pause: async () => {} });
beforeEach(() => {
  savedEnvironment = { ...process.env };
  process.env.SUBSCRIPTION_RECOVERY_ALERTS_ENABLED = "true";
  process.env.SUBSCRIPTION_RECOVERY_ALERT_EMAIL = "alerts@example.com";
});
afterEach(() => { process.env = savedEnvironment; });
test("is disabled by default and rejects missing/multiple recipient configuration", async () => {
  const send = jest.fn();
  delete process.env.SUBSCRIPTION_RECOVERY_ALERTS_ENABLED;
  expect(await notify(report(), options(send))).toMatchObject({ enabled: false, sent: 0 });
  process.env.SUBSCRIPTION_RECOVERY_ALERTS_ENABLED = "true";
  for (const recipient of ["", "a@example.com b@example.com", "a@example.com\nb@example.com"]) {
    process.env.SUBSCRIPTION_RECOVERY_ALERT_EMAIL = recipient;
    expect(await notify(report(), options(send))).toMatchObject({ configurationError: true });
  }
  expect(send).not.toHaveBeenCalled();
});
test("alerts once across repeated scans and sends only newly discovered incidents", async () => {
  const send = jest.fn(async () => ({ data: { id: "email-1" }, error: null }));
  const first = report();
  expect(await notify(first, options(send))).toMatchObject({ sent: 1 });
  expect(await notify(first, options(send))).toMatchObject({ sent: 0 });
  const second = report();
  expect(await notify({ mutations: [...first.mutations, ...second.mutations] }, options(send))).toMatchObject({ sent: 1 });
  expect(send).toHaveBeenCalledTimes(2);
  expect(send.mock.calls[0][0].to).toBe("alerts@example.com");
  expect(JSON.stringify(send.mock.calls[0])).not.toContain("private@example.com");
  expect(JSON.stringify(send.mock.calls[0])).not.toContain("never include");
});
test("concurrent workers send one notification and retain deduplication state in MongoDB", async () => {
  const send = jest.fn(async () => ({ data: { id: "email-race" } }));
  const found = report();
  await Promise.all([notify(found, options(send)), notify(found, options(send))]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(await Alert.countDocuments({ notified: true })).toBe(1);
  expect(await notify(found, options(send))).toMatchObject({ sent: 0 });
});
test("provider errors retry with the same stored payload and idempotency key", async () => {
  const found = report();
  const send = jest.fn().mockResolvedValueOnce({ error: { message: "provider secret must not be logged" } }).mockResolvedValueOnce({ data: { id: "email-retry" } });
  expect(await notify(found, { ...options(send), now: 1000000 })).toMatchObject({ failed: 1, sent: 0 });
  expect(await notify(found, { ...options(send), now: 1001000 })).toMatchObject({ sent: 1 });
  expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
  expect(await Alert.countDocuments({ notified: true })).toBe(1);
});
test("a crash after send retries the original provider request after claim expiry", async () => {
  const found = report();
  const send = jest.fn(async () => ({ data: { id: "original-provider-id" } }));
  await notify(found, { ...options(send), now: 1000000 });
  // Recreate the persisted state of a worker that sent successfully but died before acknowledgement.
  await Alert.updateOne({}, { $set: { notified: false, claimOwner: "dead-worker", claimUntil: new Date(1300000) } });
  expect(await notify(found, { ...options(send), now: 1299999 })).toMatchObject({ sent: 0 });
  expect(await notify(found, { ...options(send), now: 1300001 })).toMatchObject({ sent: 1 });
  expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
});
test("does not retry an uncertain delivery outside the provider idempotency window", async () => {
  const found = report();
  const send = jest.fn(async () => { throw Error("connection lost"); });
  await notify(found, { ...options(send), now: 1000000 });
  expect(await notify(found, { ...options(send), now: 1000000 + 24 * 3600000 })).toMatchObject({ needsReview: 1, sent: 0 });
  expect(send).toHaveBeenCalledTimes(1);
});
test("healthy scans are silent, and an observed resolution permits a new incident alert", async () => {
  const send = jest.fn(async () => ({ data: { id: "email" } }));
  expect(await notify({}, options(send))).toMatchObject({ sent: 0 });
  const found = report();
  await notify(found, options(send));
  await notify({}, options(send));
  expect(await notify(found, options(send))).toMatchObject({ sent: 1 });
  expect(send.mock.calls[0][1].idempotencyKey).not.toBe(send.mock.calls[1][1].idempotencyKey);
});
test("changing the configured recipient routes subsequent alerts to the new address", async () => {
  const found = report();
  const send = jest.fn(async () => ({ data: { id: "email" } }));
  await notify(found, options(send));
  process.env.SUBSCRIPTION_RECOVERY_ALERT_EMAIL = "different@example.com";
  await notify(found, options(send));
  expect(send.mock.calls.map(call => call[0].to)).toEqual(["alerts@example.com", "different@example.com"]);
});
test("bounds provider calls per scan and escapes untrusted identifiers", async () => {
  const send = jest.fn(async () => ({ data: { id: "email" } }));
  const found = { mutations: Array.from({ length: 7 }, () => ({ ...report().mutations[0], operationId: "<script>test</script>" })) };
  expect(await notify(found, options(send))).toMatchObject({ sent: 5, observed: 7 });
  expect(await notify(found, options(send))).toMatchObject({ sent: 2 });
  expect(send.mock.calls[0][0].html).toContain("&lt;script&gt;");
  expect(send.mock.calls[0][0].html).not.toContain("<script>");
});
test("UAT labels real-provider requests and forwards the idempotency key", async () => {
  const providerSend = jest.fn(async () => ({ data: { id: "provider" } }));
  jest.spyOn(require("resend"), "Resend").mockImplementation(() => ({ emails: { send: providerSend } }));
  process.env.APP_ENV = "uat";
  process.env.EMAIL_TRANSPORT = "resend";
  process.env.RESEND_EMAIL_KEY = "re_test_not_live";
  const transport = require("../../Integration/emailTransport").createEmailTransport();
  await transport.emails.send({ subject: "Recovery test", to: "alerts@example.com" }, { idempotencyKey: "recovery-test-key" });
  expect(providerSend).toHaveBeenCalledWith(expect.objectContaining({ subject: "[UAT] Recovery test" }), { idempotencyKey: "recovery-test-key" });
});
test("does not call the provider when ownership is lost before persisting its request", async () => {
  const originalUpdate = Alert.updateOne.bind(Alert);
  jest.spyOn(Alert, "updateOne").mockImplementation((filter, update, settings) => {
    if (update.$set?.requestKey) return Promise.resolve({ modifiedCount: 0, matchedCount: 0 });
    return originalUpdate(filter, update, settings);
  });
  const send = jest.fn();
  await expect(notify(report(), options(send))).rejects.toThrow("claim_lost");
  expect(send).not.toHaveBeenCalled();
});
