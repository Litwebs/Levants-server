const mongoose = require("mongoose");

const deliveryBatchSchema = new mongoose.Schema(
  {
    deliveryDate: {
      type: Date,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["collecting", "locked", "routes_generated", "completed"],
      default: "collecting",
      index: true,
    },

    orders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
    ],

    routes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Route",
      },
    ],

    lockedAt: {
      type: Date,
    },

    generatedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

deliveryBatchSchema.index({ deliveryDate: 1, status: 1 });

module.exports = mongoose.model("DeliveryBatch", deliveryBatchSchema);
