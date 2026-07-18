const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: null, trim: true, maxlength: 60 },
    fullName: { type: String, default: null, trim: true, maxlength: 100 },
    phone: { type: String, default: null, trim: true, maxlength: 30 },
    line1: { type: String, required: true, trim: true },
    line2: { type: String, default: null, trim: true },
    city: { type: String, required: true, trim: true },
    postcode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    deliveryInstructions: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true, _id: true, id: true },
);

const notificationPreferencesSchema = new mongoose.Schema(
  {
    orderUpdates: { type: Boolean, default: true },
    subscriptionUpdates: { type: Boolean, default: true },
    deliveryUpdates: { type: Boolean, default: true },
    promotions: { type: Boolean, default: false },
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

    stripeCustomerId: {
      type: String,
      default: null,
      index: true,
    },

    // Store credit / wallet balance, held in MINOR units (pence). 100 = £1.00
    creditBalance: {
      type: Number,
      default: 0,
      min: 0,
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

    // ===== Portal auth fields (populated when isGuest: false) =====
    passwordHash: {
      type: String,
      select: false,
      default: null,
    },

    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
      index: true,
    },

    emailVerifiedAt: {
      type: Date,
      default: null,
    },

    emailVerificationCodeHash: {
      type: String,
      select: false,
      default: null,
    },

    emailVerificationCodeExpiresAt: {
      type: Date,
      default: null,
    },

    pendingEmail: {
      type: String,
      lowercase: true,
      trim: true,
      default: null,
    },

    pendingEmailTokenHash: {
      type: String,
      select: false,
      default: null,
    },

    pendingEmailTokenExpiresAt: {
      type: Date,
      default: null,
    },

    // Password reset
    passwordResetTokenHash: {
      type: String,
      select: false,
      default: null,
    },
    passwordResetTokenExpiresAt: {
      type: Date,
      default: null,
    },

    notificationPreferences: {
      type: notificationPreferencesSchema,
      default: () => ({}),
    },

    themePreference: {
      type: String,
      enum: ["light", "dark"],
      default: "light",
    },

    // 🔮 Future: link to admin User if needed
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

customerSchema.pre("save", function ensureEmbeddedAddressIds() {
  if (!Array.isArray(this.addresses)) return;

  this.addresses.forEach((address) => {
    if (!address._id) {
      address._id = new mongoose.Types.ObjectId();
    }
  });
});

// Clean output
customerSchema.method("toJSON", function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
});

module.exports = mongoose.model("Customer", customerSchema);
