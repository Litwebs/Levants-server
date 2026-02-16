const mongoose = require("mongoose");

const routeSchema = new mongoose.Schema(
  {
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeliveryBatch",
      required: true,
      index: true,
    },

    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    totalStops: {
      type: Number,
      default: 0,
    },

    totalDistanceMeters: {
      type: Number,
      default: 0,
    },

    totalDurationSeconds: {
      type: Number,
      default: 0,
    },

    polyline: {
      type: String,
    },

    status: {
      type: String,
      enum: ["planned", "in_progress", "completed"],
      default: "planned",
      index: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Route", routeSchema);
