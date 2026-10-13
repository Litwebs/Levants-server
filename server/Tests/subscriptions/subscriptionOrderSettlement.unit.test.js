"use strict";
const { remainingSubscriptionOrderValueMinor: remaining } = require("../../utils/subscriptionOrderSettlement.util");

it.each([
  ["credit decrease", { amountPaid: 8.5, total: 3.5 }, 350],
  ["card decrease already deducted", { amountPaid: 3.5, total: 3.5, refunds: [{ amountMinor: 500 }] }, 350],
  ["paid add-on retained", { amountPaid: 12.5, total: 7.5 }, 750],
  ["increase after credit decrease", { amountPaid: 11, total: 6 }, 600],
  ["underpaid order", { amountPaid: 2, total: 3.5 }, 200],
  ["zero capture", { amountPaid: 0, total: 3.5 }, 0],
  ["legacy missing amountPaid", { total: 3.5 }, 350],
  ["legacy missing total", { amountPaid: 3.5 }, 350],
  ["empty order", {}, 0],
  ["invalid amount", { amountPaid: NaN, total: 3.5 }, 0],
])("caps the terminal settlement: %s", (_, order, expected) => {
  expect(remaining(order)).toBe(expected);
});
