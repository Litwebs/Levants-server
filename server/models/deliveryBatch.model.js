const mongoose = require("mongoose");

const deliveryBatchSchema = new mongoose.Schema(
  {
    deliveryDate: {
      type: Date,
      required: true,
      index: true,
    },

    deliveryWindowStart: {
      type: String,
    },

    deliveryWindowEnd: {
      type: String,
    },

    status: {
      type: String,
      enum: [
        "collecting",
        "locked",
        "routes_generated",
        "dispatched",
        "completed",
      ],
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

    dispatchedAt: {
      type: Date,
    },

    completedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

deliveryBatchSchema.index({ deliveryDate: 1, status: 1 });

module.exports = mongoose.model("DeliveryBatch", deliveryBatchSchema);
