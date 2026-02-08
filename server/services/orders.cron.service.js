const mongoose = require("mongoose");
const Order = require("../models/order.model");
const ProductVariant = require("../models/variant.model");

async function ExpirePendingOrders() {
  const now = new Date();

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const orders = await Order.find({
      status: "pending",
      reservationExpiresAt: { $lte: now },
    }).session(session);

    for (const order of orders) {
      for (const item of order.items) {
        await ProductVariant.findByIdAndUpdate(
          item.variant,
          { $inc: { reservedQuantity: -item.quantity } },
          { session },
        );
      }

      order.status = "cancelled";
      await order.save({ session });
    }

    await session.commitTransaction();
    session.endSession();

    if (orders.length > 0) {
      console.log(`Expired ${orders.length} orders`);
    }
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("❌ Order expiration cron failed:", err);
  }
}

module.exports = {
  ExpirePendingOrders,
};
