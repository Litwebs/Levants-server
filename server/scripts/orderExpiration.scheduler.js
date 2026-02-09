const cron = require("node-cron");
const { ExpirePendingOrders } = require("../services/orders.cron.service");

async function runOrderExpirationJob() {
  return ExpirePendingOrders();
}

function startOrderExpirationCron() {
  // Every minute (safe + common)
  cron.schedule("* * * * *", async () => {
    try {
      await ExpirePendingOrders();
    } catch (err) {
      console.error("Cron execution error:", err);
    }
  });

  console.log("Order expiration cron started");
}

module.exports = {
  runOrderExpirationJob,
  startOrderExpirationCron,
};
