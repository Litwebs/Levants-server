const mongoose = require("mongoose");

const dealItemSchema = new mongoose.Schema(
  {
    variant: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ProductVariant",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
  },
  { _id: false },
);

const dealSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 140,
    },
    slug: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true,
      maxlength: 160,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 3000,
      default: "",
    },
    imageUrl: {
      type: String,
      trim: true,
      maxlength: 2048,
      default: "",
    },
    items: {
      type: [dealItemSchema],
      required: true,
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: "A deal must contain at least one item",
      },
    },
    packagePrice: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      default: "GBP",
      uppercase: true,
      trim: true,
      minlength: 3,
      maxlength: 3,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },
    startsAt: {
      type: Date,
      default: null,
      index: true,
    },
    endsAt: {
      type: Date,
      default: null,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
      min: 0,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

dealSchema.index({ isActive: 1, isFeatured: -1, sortOrder: 1, createdAt: -1 });

dealSchema.method("toJSON", function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
});

module.exports = mongoose.model("Deal", dealSchema);
