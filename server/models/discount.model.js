const mongoose = require("mongoose");

const discountSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      unique: true,
      index: true,
      minlength: 3,
      maxlength: 32,
    },

    kind: {
      type: String,
      enum: ["percent", "amount"],
      required: true,
      index: true,
    },

    percentOff: {
      type: Number,
      min: 1,
      max: 100,
    },

    amountOff: {
      type: Number,
      min: 0,
    },

    currency: {
      type: String,
      default: "GBP",
    },

    scope: {
      type: String,
      enum: ["global", "category", "variant"],
      default: "global",
      index: true,
    },

    category: {
      type: String,
      trim: true,
      index: true,
    },

    variantIds: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "ProductVariant",
      default: [],
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    startsAt: {
      type: Date,
    },

    endsAt: {
      type: Date,
      index: true,
    },

    maxRedemptions: {
      type: Number,
      min: 1,
    },

    perCustomerLimit: {
      type: Number,
      min: 1,
    },

    stripeCouponId: {
      type: String,
      index: true,
    },

    stripePromotionCodeId: {
      type: String,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true },
);

discountSchema.method("toJSON", function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
});

module.exports = mongoose.model("Discount", discountSchema);
