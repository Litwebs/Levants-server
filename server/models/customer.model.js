const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, required: true, trim: true },
    line2: { type: String, default: null, trim: true },
    city: { type: String, required: true, trim: true },
    postcode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },

    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false },
);

const customerSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    firstName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },

    phone: {
      type: String,
      default: null,
      trim: true,
    },

    addresses: {
      type: [addressSchema],
      default: [],
    },

    // 🔑 Guest-first design
    isGuest: {
      type: Boolean,
      default: true,
      index: true,
    },

    // 🔮 Future: link to User if they register
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // Optional analytics
    lastOrderAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Helpful compound index
customerSchema.index({ email: 1, isGuest: 1 });

// Clean output
customerSchema.method("toJSON", function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
});

module.exports = mongoose.model("Customer", customerSchema);
