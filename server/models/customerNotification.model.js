"use strict";

const mongoose = require("mongoose");

/**
 * CustomerNotification – in-app notification records for the customer portal.
 * External delivery (email/SMS) is handled separately via Email.service.
 */
const customerNotificationSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "order_placed",
        "order_confirmed",
        "order_out_for_delivery",
        "order_delivered",
        "order_cancelled",
        "subscription_created",
        "subscription_updated",
        "subscription_paused",
        "subscription_resumed",
        "subscription_cancelled",
        "subscription_upcoming_delivery",
        "payment_failed",
        "product_unavailable",
        "support_request_updated",
        "general",
      ],
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    readAt: {
      type: Date,
      default: null,
    },

    // Related entities for deep-linking
    relatedOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    relatedSubscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },

    relatedSupportRequest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupportRequest",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

customerNotificationSchema.index({ customer: 1, readAt: 1, createdAt: -1 });

customerNotificationSchema.method("toJSON", function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
});

module.exports = mongoose.model(
  "CustomerNotification",
  customerNotificationSchema,
);
