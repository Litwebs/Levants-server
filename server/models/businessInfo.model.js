const mongoose = require("mongoose");

const businessInfoSchema = new mongoose.Schema(
  {
    // Singleton marker. Using a real unique key avoids invalid empty-index hacks.
    singletonKey: {
      type: String,
      default: "business-info",
      immutable: true,
      unique: true,
      index: true,
    },

    companyName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },

    phone: {
      type: String,
      trim: true,
    },

    address: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("BusinessInfo", businessInfoSchema);
