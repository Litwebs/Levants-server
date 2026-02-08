const mongoose = require("mongoose");

/**
 * Individual item snapshot
 * (NEVER recomputed after creation)
 */
const orderItemSchema = new mongoose.Schema(
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

    name: {
      type: String,
      required: true,
    },

    sku: {
      type: String,
      required: true,
    },

    price: {
      type: Number,
      required: true, // price at purchase
      min: 0,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

/**
 * Order schema
 */
const orderSchema = new mongoose.Schema(
  {
    // Guest or registered customer
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (arr) => arr.length > 0,
        message: "Order must contain at least one item",
      },
    },

    currency: {
      type: String,
      default: "GBP",
    },

    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },

    deliveryFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    total: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: [
        "pending", // created, awaiting payment
        "paid", // payment confirmed via webhook
        "failed", // payment failed
        "cancelled", // manually cancelled
        "refunded", // refunded later
      ],
      default: "pending",
      index: true,
    },

    reservationExpiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    /**
     * Stripe references
     */
    stripeCheckoutSessionId: {
      type: String,
      index: true,
    },

    stripePaymentIntentId: {
      type: String,
      index: true,
    },

    paidAt: {
      type: Date,
    },

    metadata: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  },
);

/**
 * Clean API output
 */
orderSchema.method("toJSON", function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
});

module.exports = mongoose.model("Order", orderSchema);
