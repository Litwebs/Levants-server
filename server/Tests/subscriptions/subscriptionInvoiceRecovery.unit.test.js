"use strict";
const { selectInvoicesForRecovery } = require("../../services/subscriptions/subscriptionInvoiceRecovery.util");
it("includes a recent invoice even when an order is already linked", () => {
  const invoice = { id: "partial", paid: true, created: 101 };
  expect(selectInvoicesForRecovery([invoice], new Set(["partial"]), 100).recent).toEqual([invoice]);
});
it("includes recent invoices with no linked orders", () => {
  const invoice = { id: "missing", status: "paid", created: 100 };
  expect(selectInvoicesForRecovery([invoice], new Set(), 100).recent).toEqual([invoice]);
});
it("quarantines historical missing invoices without blocking recent recovery", () => {
  const old = { id: "old", paid: true, created: 99 };
  const recent = { id: "new", paid: true, created: 100 };
  expect(selectInvoicesForRecovery([old, recent], new Set(), 100)).toEqual({ historical: [old], recent: [recent] });
});
it("does not replay historical linked invoices or unpaid invoices", () => {
  expect(selectInvoicesForRecovery([
    { id: "old", paid: true, created: 99 },
    { id: "unpaid", status: "open", created: 101 },
  ], new Set(["old"]), 100)).toEqual({ historical: [], recent: [] });
});
it("replays recent billing windows in chronological order", () => {
  expect(selectInvoicesForRecovery([
    { id: "second", paid: true, created: 102 },
    { id: "first", paid: true, created: 101 },
  ], new Set(["first", "second"]), 100).recent.map(i => i.id)).toEqual(["first", "second"]);
});
