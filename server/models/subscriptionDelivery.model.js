"use strict";

const mongoose = require("mongoose");

/**
 * SubscriptionDelivery – one scheduled delivery slot for a subscription.
 * Each active subscription generates upcoming SubscriptionDelivery records
 * via the scheduler. When the order is generated, `order` is populated.
 */
const subscriptionDeliverySchema = new mongoose.Schema(
  {
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      required: true,
      index: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    // Populated once an order is generated from this delivery slot
    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    scheduledDate: {
      type: Date,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: [
        "scheduled",
        "generated",
        "skipped",
        "delivered",
        "failed",
        "rescheduled",
        "cancelled",
      ],
      default: "scheduled",
      index: true,
    },

    failReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    // When the order was generated from this slot
    generatedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

subscriptionDeliverySchema.index({ subscription: 1, scheduledDate: 1 });
subscriptionDeliverySchema.index({ scheduledDate: 1, status: 1 });

subscriptionDeliverySchema.method("toJSON", function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
});

module.exports = mongoose.model(
  "SubscriptionDelivery",
  subscriptionDeliverySchema,
);
