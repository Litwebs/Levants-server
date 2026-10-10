"use strict";

const mongoose = require("mongoose");

/**
 * PaymentMethod – placeholder for customer saved payment methods.
 * Not tied to Stripe until provider integration is added.
 */
const paymentMethodSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["card", "bank_transfer", "cash", "other"],
      required: true,
    },

    provider: {
      type: String,
      trim: true,
      default: null,
    },

    // External provider reference (e.g. Stripe payment method ID)
    providerReference: {
      type: String,
      trim: true,
      default: null,
      select: false,
    },

    // Card display info (placeholders)
    lastFour: { type: String, default: null },
    expiryMonth: { type: Number, default: null },
    expiryYear: { type: Number, default: null },
    cardBrand: { type: String, default: null },

    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

paymentMethodSchema.index({ customer: 1, isDefault: 1 });
paymentMethodSchema.index({ customer: 1, provider: 1, providerReference: 1 }, {
  unique: true, name: "customer_1_provider_1_providerReference_1",
  partialFilterExpression: { providerReference: { $type: "string" } },
});

paymentMethodSchema.method("toJSON", function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
});

require("../utils/subscriptionLease.util").leaseFencingPlugin(paymentMethodSchema);

module.exports = mongoose.model("PaymentMethod", paymentMethodSchema);
