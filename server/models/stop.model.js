const mongoose = require("mongoose");

const stopSchema = new mongoose.Schema(
  {
    route: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Route",
      required: true,
      index: true,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },

    sequence: {
      type: Number,
      required: true,
    },

    estimatedArrival: {
      type: Date,
    },

    estimatedDeparture: {
      type: Date,
    },

    status: {
      type: String,
      enum: ["pending", "delivered", "failed"],
      default: "pending",
      index: true,
    },
  },
  { timestamps: true },
);

stopSchema.index({ route: 1, sequence: 1 });

module.exports = mongoose.model("Stop", stopSchema);
