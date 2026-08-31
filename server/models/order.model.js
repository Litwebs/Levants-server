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

    // True only for a one-off item attached to a subscription delivery. This
    // keeps fulfilment consolidated without changing the recurring plan.
    isSubscriptionAddOn: {
      type: Boolean,
      default: false,
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

    deliveryAddress: {
      line1: { type: String, required: true },
      line2: { type: String },
      city: { type: String, required: true },
      postcode: { type: String, required: true },
      country: { type: String, required: true },
    },

    deliveryDate: {
      type: Date,
      default: null,
      index: true,
    },

    customerInstructions: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: "",
    },

    driverNote: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    location: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
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

    // Discount snapshot (so DB reflects what customer paid)
    isDiscounted: {
      type: Boolean,
      default: false,
      index: true,
    },

    totalBeforeDiscount: {
      type: Number,
      min: 0,
    },

    discountAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    // Store credit applied to this order, in MINOR units (pence).
    // Redeemed from the customer's balance when the order is paid.
    creditApplied: {
      type: Number,
      default: 0,
      min: 0,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "unpaid",
        "paid",
        "partially_paid",
        "failed",
        "cancelled",
        "refund_pending",
        "partially_refunded",
        "refunded",
        "refund_failed",
      ],
      default: "pending",
      index: true,
    },

    deliveryStatus: {
      type: String,
      enum: ["ordered", "dispatched", "in_transit", "delivered", "returned"],
      default: "ordered",
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

    stripeInvoiceId: {
      type: String,
      index: true,
    },

    paidAt: {
      type: Date,
    },

    /** Amount collected for imported orders (supports partial payment) */
    amountPaid: {
      type: Number,
      min: 0,
    },

    // Delivery-level allocation ledger. Multiple delivery orders may share one
    // Stripe invoice/PaymentIntent, while later modifications can add separate
    // intents. This ledger keeps each delivery independently auditable without
    // splitting the customer's bill or transaction.
    paymentAllocations: {
      type: [
        new mongoose.Schema(
          {
            paymentIntentId: { type: String, required: true, index: true },
            stripeInvoiceId: { type: String, default: null, index: true },
            source: {
              type: String,
              enum: [
                "subscription_invoice",
                "modification",
                "resume",
                "delivery_add_on",
              ],
              required: true,
            },
            amountMinor: { type: Number, required: true, min: 0 },
            idempotencyKey: { type: String, default: null },
            createdAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
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

    refunds: {
      type: [
        new mongoose.Schema(
          {
            stripeRefundId: {
              type: String,
              index: true,
            },

            paymentIntentId: {
              type: String,
              index: true,
            },

            currency: {
              type: String,
              default: "GBP",
            },

            // Store both for safety: Stripe uses minor units; UI prefers major.
            amount: {
              type: Number,
              min: 0,
            },

            amountMinor: {
              type: Number,
              min: 0,
            },

            status: {
              type: String,
              enum: ["pending", "succeeded", "failed"],
              default: "pending",
              index: true,
            },

            refundedAt: {
              type: Date,
            },

            failedAt: {
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

            createdAt: {
              type: Date,
              default: Date.now,
            },
          },
          { _id: false },
        ),
      ],
      default: [],
    },

    metadata: {
      type: Object,
      default: {},
    },

    archived: {
      type: Boolean,
      default: false,
      index: true,
    },

    archivedAt: {
      type: Date,
      default: null,
      index: true,
    },

    // ===== Customer portal additions =====
    orderType: {
      type: String,
      enum: ["one_time", "subscription_generated"],
      default: "one_time",
      index: true,
    },

    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
      index: true,
    },

    // Delivery status extended for portal (extends existing deliveryStatus)
    // We keep the existing deliveryStatus field and add portal-specific delivery tracking
    portalDeliveryStatus: {
      type: String,
      enum: [
        "scheduled",
        "preparing",
        "out_for_delivery",
        "delivered",
        "failed",
        "rescheduled",
        "cancelled",
      ],
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

orderSchema.index(
  { stripeInvoiceId: 1, subscription: 1, deliveryDate: 1 },
  {
    unique: true,
    partialFilterExpression: { stripeInvoiceId: { $type: "string" } },
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

orderSchema.index({ "location.lat": 1, "location.lng": 1 });
orderSchema.index({ deliveryDate: 1, status: 1 });

module.exports = mongoose.model("Order", orderSchema);
