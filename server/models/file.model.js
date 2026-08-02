// src/models/file.model.js
const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema(
  {
    originalName: {
      type: String,
      required: true,
      trim: true,
    },

    filename: {
      // Cloudinary public_id
      type: String,
      required: true,
      index: true,
    },

    mimeType: {
      type: String,
      required: true,
      index: true,
    },

    sizeBytes: {
      type: Number,
      required: true,
    },

    width: {
      type: Number,
      min: 1,
    },

    height: {
      type: Number,
      min: 1,
    },

    url: {
      type: String,
      required: true,
    },

    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    isArchived: {
      type: Boolean,
      default: false,
      index: true,
    },

    archivedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true },
);

fileSchema.method("toJSON", function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
});

module.exports = mongoose.model("File", fileSchema);
