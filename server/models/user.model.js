// src/models/user.model.js
const mongoose = require("mongoose");

const twoFactorLoginSchema = new mongoose.Schema(
  {
    codeHash: { type: String, select: false },
    expiresAt: { type: Date },

    attempts: { type: Number, default: 0, select: false },
    maxAttempts: { type: Number, default: 6 },

    usedAt: { type: Date },
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    rememberMe: { type: Boolean, default: false },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    // ===== Email change flow =====
    pendingEmail: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },
    pendingEmailTokenHash: {
      type: String,
      select: false,
    },
    pendingEmailTokenExpiresAt: {
      type: Date,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false,
    },

    // ✅ Role reference (RBAC)
    role: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Role",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
      index: true,
    },

    avatarUrl: {
      type: String,
    },

    lastLoginAt: {
      type: Date,
    },

    preferences: {
      theme: {
        type: String,
        enum: ["light", "dark", "system"],
        default: "system",
      },
      language: {
        type: String,
        default: "en-GB",
      },
      notifications: {
        newOrders: {
          type: Boolean,
          default: true,
        },
        orderUpdates: {
          type: Boolean,
          default: true,
        },
        lowStockAlerts: {
          type: Boolean,
          default: true,
        },
        outOfStock: {
          type: Boolean,
          default: true,
        },
        deliveryUpdates: {
          type: Boolean,
          default: false,
        },
        customerMessages: {
          type: Boolean,
          default: true,
        },
        paymentReceived: {
          type: Boolean,
          default: true,
        },
      },
    },

    // ===== 2FA =====
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },

    twoFactorSecret: {
      type: String,
      select: false,
    },

    twoFactorLogin: {
      type: twoFactorLoginSchema,
      default: undefined,
      select: false,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
// NOTE: keep indexes defined once. `email` is indexed via `unique: true`.
// `role` and `status` are indexed via `index: true` on the fields.
// (Duplicate index definitions trigger Mongoose warnings.)

// Clean JSON output
userSchema.method("toJSON", function () {
  const obj = this.toObject({ virtuals: true });

  delete obj.passwordHash;
  delete obj.twoFactorSecret;
  delete obj.twoFactorLogin;
  delete obj.__v;

  return obj;
});

module.exports = mongoose.model("User", userSchema);
