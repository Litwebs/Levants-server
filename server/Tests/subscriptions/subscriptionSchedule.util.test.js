"use strict";
const cron = require("node-cron");
const { SUBSCRIPTION_CRON_EXPRESSION, SUBSCRIPTION_CRON_TIME_ZONE,
  isDailySubscriptionMaintenanceTime } = require("../../utils/subscriptionSchedule.util");

test.each([
  ["2026-03-28T06:00:00Z", true], ["2026-03-29T05:00:00Z", true],
  ["2026-03-29T06:00:00Z", false], ["2026-03-30T05:00:00Z", true],
  ["2026-10-24T05:00:00Z", true], ["2026-10-25T05:00:00Z", false],
  ["2026-10-25T06:00:00Z", true], ["2026-10-26T06:00:00Z", true],
  ["2026-03-29T04:45:00Z", false], ["2026-03-29T05:15:00Z", false],
  ["2026-10-25T05:45:00Z", false], ["2026-10-25T06:15:00Z", false],
])("gates maintenance at 06:00 London: %s", (value, expected) => {
  expect(isDailySubscriptionMaintenanceTime(new Date(value))).toBe(expected);
});

test.each(["2026-03-29T00:45:00Z", "2026-10-25T00:45:00Z"])(
  "actual cron advances through the clock transition without skipping: %s", value => {
    const task = cron.createTask(SUBSCRIPTION_CRON_EXPRESSION, () => {}, { timezone: SUBSCRIPTION_CRON_TIME_ZONE });
    try {
      let current = new Date(value);
      for (let i = 0; i < 28; i++) {
        const next = task.timeMatcher.getNextMatch(current);
        expect(next.getTime() - current.getTime()).toBe(15 * 60000);
        current = next;
      }
    } finally { task.destroy(); }
  });
