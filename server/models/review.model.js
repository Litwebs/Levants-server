const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },

    customerName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    imageUrl: {
      type: String,
      default: null,
    },

    // Cloudinary public_id — stored so we can delete on review removal
    imagePublicId: {
      type: String,
      default: null,
    },

    isVisible: {
      type: Boolean,
      // Reviews require administrator approval before public publication.
      default: false,
      index: true,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Review", reviewSchema);
