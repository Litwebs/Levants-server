const cron = require("node-cron");
const {
  ExpirePendingOrders,
} = require("../services/orders/orders.cron.service");
const logger = require("../utils/logger.util");

async function runOrderExpirationJob() {
  return ExpirePendingOrders();
}

function startOrderExpirationCron() {
  // Every minute (safe + common)
  cron.schedule("* * * * *", async () => {
    try {
      await ExpirePendingOrders();
    } catch (err) {
      logger.error("Order expiration cron failed", err);
    }
  });

  logger.cron("Order expiration");
}

module.exports = {
  runOrderExpirationJob,
  startOrderExpirationCron,
};
