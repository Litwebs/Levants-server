"use strict";
const { SUBSCRIPTION_TIME_ZONE, zonedParts } = require("./subscriptionCutoff.util");
// A fixed UTC heartbeat avoids node-cron's next-match DST arithmetic. Business
// time is evaluated for each tick, so daily maintenance stays at 06:00 London.
const SUBSCRIPTION_CRON_EXPRESSION = "*/15 * * * *";
const SUBSCRIPTION_CRON_TIME_ZONE = "UTC";
function isDailySubscriptionMaintenanceTime(value = new Date()) {
  const local = zonedParts(value, SUBSCRIPTION_TIME_ZONE);
  return Boolean(local && local.hour === 6 && local.minute === 0);
}
module.exports = { SUBSCRIPTION_CRON_EXPRESSION, SUBSCRIPTION_CRON_TIME_ZONE, isDailySubscriptionMaintenanceTime };
