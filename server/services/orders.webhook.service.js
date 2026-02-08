const mongoose = require("mongoose");
const Order = require("../models/order.model");
const ProductVariant = require("../models/variant.model");

async function HandlePaymentSuccess(session) {
  const orderId = session.metadata?.orderId;
  if (!orderId) return;

  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();

  try {
    const order = await Order.findOne({
      _id: orderId,
      status: "pending_payment",
    }).session(dbSession);

    if (!order) throw new Error("Order not found or already processed");

    for (const item of order.items) {
      await ProductVariant.findByIdAndUpdate(
        item.variant,
        {
          $inc: {
            stockQuantity: -item.quantity,
            reservedQuantity: -item.quantity,
          },
        },
        { session: dbSession },
      );
    }

    order.status = "paid";
    order.paidAt = new Date();
    await order.save({ session: dbSession });

    await dbSession.commitTransaction();
    dbSession.endSession();
  } catch (err) {
    await dbSession.abortTransaction();
    dbSession.endSession();
    throw err;
  }
}

async function HandlePaymentExpired(session) {
  await releaseStock(session.metadata?.orderId);
}

async function HandlePaymentFailed(paymentIntent) {
  await releaseStock(paymentIntent.metadata?.orderId);
}

async function releaseStock(orderId) {
  if (!orderId) return;

  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();

  try {
    const order = await Order.findOne({
      _id: orderId,
      status: "pending_payment",
    }).session(dbSession);

    if (!order) return;

    for (const item of order.items) {
      await ProductVariant.findByIdAndUpdate(
        item.variant,
        {
          $inc: { reservedQuantity: -item.quantity },
        },
        { session: dbSession },
      );
    }

    order.status = "cancelled";
    await order.save({ session: dbSession });

    await dbSession.commitTransaction();
    dbSession.endSession();
  } catch (err) {
    await dbSession.abortTransaction();
    dbSession.endSession();
    throw err;
  }
}

module.exports = {
  HandlePaymentSuccess,
  HandlePaymentExpired,
  HandlePaymentFailed,
};
