const mongoose = require("mongoose");

const discountRedemptionSchema = new mongoose.Schema(
  {
    discount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Discount",
      required: true,
      index: true,
    },

    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    order: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true,
      index: true,
    },

    stripeCheckoutSessionId: {
      type: String,
      index: true,
    },

    redeemedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

discountRedemptionSchema.method("toJSON", function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
});

module.exports = mongoose.model("DiscountRedemption", discountRedemptionSchema);
