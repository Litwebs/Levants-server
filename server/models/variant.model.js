// src/models/productVariant.model.js
const mongoose = require("mongoose");

const productVariantSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    sku: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    stockQuantity: {
      type: Number,
      required: true,
      min: 0,
    },

    reservedQuantity: {
      type: Number,
      default: 0,
      min: 0,
    },

    lowStockAlert: {
      type: Number,
      default: 5,
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },

    thumbnailImage: {
      type: String,
      required: true,
    },

    // Stripe (future)
    stripeProductId: { type: String },
    stripePriceId: { type: String },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

productVariantSchema.method("toJSON", function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
});

module.exports = mongoose.model("ProductVariant", productVariantSchema);
