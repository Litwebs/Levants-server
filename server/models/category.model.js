const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      unique: true,
    },

    subtitle: {
      type: String,
      trim: true,
      maxlength: 300,
      default: "",
    },

    image: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
      default: null,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Category", categorySchema);
