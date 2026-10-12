"use strict";
const { REQUIRED_EVENTS, checkSubscriptionEndpoints: check } = require("../../utils/subscriptionWebhookConfiguration.util");
const endpoint = (id, events = REQUIRED_EVENTS) => ({ id, status: "enabled", enabled_events: events });
test("events spread across unrelated endpoints do not pass subscription preflight", () => {
  expect(check([endpoint("one", REQUIRED_EVENTS.slice(0, 4)), endpoint("two", REQUIRED_EVENTS.slice(4))]))
    .toMatchObject({ ok: false, ambiguous: true });
});
test("an explicitly selected endpoint must receive every required event", () => {
  expect(check([endpoint("one", ["invoice.created"]), endpoint("two")], "one"))
    .toMatchObject({ ok: false, missingEvents: expect.arrayContaining(["refund.failed", "invoice.payment_failed"]) });
  expect(check([endpoint("one"), endpoint("two")], "two").ok).toBe(true);
});
test("a single enabled wildcard endpoint passes", () => {
  expect(check([endpoint("one", ["*"])]).ok).toBe(true);
});
test("a disabled endpoint cannot receive recovery events", () => {
  expect(check([{ ...endpoint("one"), status: "disabled" }], "one").ok).toBe(false);
});
