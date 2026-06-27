const mongoose = require("mongoose");

/**
 * Append-only ledger of store-credit movements for a customer.
 * All amounts are in MINOR units (pence). Positive `amount` adds credit,
 * negative `amount` removes/spends credit. `balanceAfter` is the customer's
 * resulting balance so history can be displayed without recomputation.
 */
const storeCreditTransactionSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    // Signed amount in pence (+ added, - spent/removed)
    amount: {
      type: Number,
      required: true,
    },

    // Customer balance (pence) after this transaction was applied
    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },

    type: {
      type: String,
      enum: [
        "subscription_refund", // credit granted from a subscription decrease
        "order_redemption", // credit spent on an order
        "order_redemption_reversal", // redemption returned (order cancelled/unpaid)
        "admin_adjustment", // manual admin add/deduct
      ],
      required: true,
      index: true,
    },

    reason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },

    // Admin user who performed a manual adjustment (if any)
    actorUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true },
);

storeCreditTransactionSchema.index({ customer: 1, createdAt: -1 });

module.exports = mongoose.model(
  "StoreCreditTransaction",
  storeCreditTransactionSchema,
);
