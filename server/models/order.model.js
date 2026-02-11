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
    /**
     * Public / human-friendly order reference
     * e.g. ORD-20260210-A9F4Q2
     */
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

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
        "pending",
        "paid",
        "failed",
        "cancelled",
        "refund_pending",
        "refunded",
        "refund_failed",
      ],
      default: "pending",
      index: true,
    },

    reservationExpiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    // When a pending order is expired/cancelled by cron
    expiresAt: {
      type: Date,
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

    refund: {
      refundedAt: {
        type: Date,
      },

      refundedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },

      reason: {
        type: String,
        maxlength: 500,
      },

      restock: {
        type: Boolean,
        default: false,
      },

      stripeRefundId: {
        type: String,
        index: true,
      },
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
 * Auto-generate unique orderId
 */
orderSchema.pre("validate", function (next) {
  if (!this.orderId) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");

    const random = Math.random().toString(36).substring(2, 8).toUpperCase();

    this.orderId = `ORD-${date}-${random}`;
  }
  // next();
});

/**
 * Clean API output
 */
orderSchema.method("toJSON", function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
});

module.exports = mongoose.model("Order", orderSchema);
