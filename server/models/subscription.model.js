"use strict";

const mongoose = require("mongoose");

const subscriptionItemSchema = new mongoose.Schema(
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

    // Snapshot at subscription creation / last edit
    name: { type: String, required: true },
    sku: { type: String, required: true },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true },
);

const subscriptionSchema = new mongoose.Schema(
  {
    subscriptionNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["active", "paused", "cancelled"],
      default: "active",
      index: true,
    },

    frequency: {
      type: String,
      enum: ["weekly", "every_two_weeks", "monthly"],
      required: true,
    },

    // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
    preferredDeliveryDay: {
      type: Number,
      min: 0,
      max: 6,
      required: true,
    },

    nextDeliveryDate: {
      type: Date,
      default: null,
      index: true,
    },

    startDate: {
      type: Date,
      required: true,
    },

    endDate: {
      type: Date,
      default: null,
    },

    // Snapshot of delivery address so changes don't affect future until explicitly updated
    deliveryAddress: {
      line1: { type: String, required: true },
      line2: { type: String, default: null },
      city: { type: String, required: true },
      postcode: { type: String, required: true },
      country: { type: String, required: true },
      deliveryInstructions: { type: String, default: null },
    },

    items: {
      type: [subscriptionItemSchema],
      validate: {
        validator: (arr) => arr.length > 0,
        message: "Subscription must contain at least one item",
      },
    },

    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },

    pausedAt: {
      type: Date,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancelReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Auto-generate subscriptionNumber before save
subscriptionSchema.pre("validate", async function () {
  if (!this.subscriptionNumber) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    this.subscriptionNumber = `SUB-${date}-${random}`;
  }
});

subscriptionSchema.index({ customer: 1, status: 1 });
subscriptionSchema.index({ nextDeliveryDate: 1, status: 1 });

subscriptionSchema.method("toJSON", function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
});

module.exports = mongoose.model("Subscription", subscriptionSchema);
