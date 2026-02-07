const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },

    category: {
      type: String,
      required: true,
      index: true,
    },

    description: {
      type: String,
      required: true,
      maxlength: 5000,
    },

    status: {
      type: String,
      enum: ["draft", "active", "archived"],
      default: "draft",
      index: true,
    },

    allergens: {
      type: [String],
      default: [],
    },

    storageNotes: {
      type: String,
      default: null,
    },

    thumbnailImage: {
      type: String,
      required: true,
    },

    galleryImages: {
      type: [String],
      validate: {
        validator: (arr) => arr.length <= 10,
        message: "Maximum of 10 gallery images allowed",
      },
      default: [],
    },
  },
  {
    timestamps: true,
  },
);

productSchema.method("toJSON", function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
});

module.exports = mongoose.model("Product", productSchema);
