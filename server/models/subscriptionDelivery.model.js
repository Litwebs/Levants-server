"use strict";

const mongoose = require("mongoose");

const deliveryAddOnItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    variant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductVariant",
      required: true,
    },
    name: { type: String, required: true },
    sku: { type: String, required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const deliveryAddOnSchema = new mongoose.Schema(
  {
    operationId: { type: String, required: true },
    items: {
      type: [deliveryAddOnItemSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "A delivery add-on must contain at least one item",
      },
    },
    amountMinor: { type: Number, required: true, min: 1 },
    stripePaymentIntentId: { type: String, required: true },
    paidAt: { type: Date, required: true },
  },
  { _id: false },
);

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

    // Paid one-off products for this delivery only. These are merged into the
    // linked Order now, or when the subscription invoice generates it later.
    addOns: {
      type: [deliveryAddOnSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

subscriptionDeliverySchema.index(
  { subscription: 1, scheduledDate: 1 },
  { unique: true },
);
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
