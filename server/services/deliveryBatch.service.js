const mongoose = require("mongoose");
const DeliveryBatch = require("../models/deliveryBatch.model");
const Order = require("../models/order.model");

/**
 * Create a delivery batch for a specific date
 */
async function createDeliveryBatch({ deliveryDate }) {
  if (!deliveryDate) {
    return { success: false, message: "deliveryDate is required" };
  }

  const date = new Date(deliveryDate);

  if (Number.isNaN(date.getTime())) {
    return { success: false, message: "Invalid deliveryDate" };
  }

  // Normalize to start of day (UTC)
  const startOfDay = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  );

  const endOfDay = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );

  // Prevent duplicate batch
  const existingBatch = await DeliveryBatch.findOne({
    deliveryDate: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
  });

  if (existingBatch) {
    return {
      success: false,
      message: "Batch already exists for this delivery date",
    };
  }

  // Find eligible orders
  const eligibleOrders = await Order.find({
    deliveryDate: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
    status: "paid",
  }).select("_id");

  if (eligibleOrders.length === 0) {
    return {
      success: false,
      message: "No eligible orders found for this date",
    };
  }

  const orderIds = eligibleOrders.map((o) => o._id);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const [batch] = await DeliveryBatch.create(
      [
        {
          deliveryDate: startOfDay,
          status: "locked",
          orders: orderIds,
          lockedAt: new Date(),
        },
      ],
      { session },
    );

    await session.commitTransaction();
    session.endSession();

    return {
      success: true,
      data: {
        batchId: batch._id,
        totalOrders: orderIds.length,
      },
    };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();

    console.error("Error creating delivery batch:", err);

    return {
      success: false,
      message: "Failed to create delivery batch",
    };
  }
}

module.exports = {
  createDeliveryBatch,
};
