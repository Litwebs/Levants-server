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
  { _id: false }
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
      unique: true, // this already creates a unique index
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
      select: false, // never return it by default
    },
    pendingEmailTokenExpiresAt: {
      type: Date,
    },

    passwordHash: {
      type: String,
      required: true,
      select: false, // ✅ better: never return by default
    },

    role: {
      type: String,
      enum: ["admin", "developer", "designer", "sales", "support"],
      default: "developer",
    },

    status: {
      type: String,
      enum: ["active", "disabled"],
      default: "active",
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
    },

    // ===== 2FA =====
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },

    // (kept for future TOTP; not used for email-code login)
    twoFactorSecret: {
      type: String,
      select: false,
    },

    // Email-code login challenge (stored on user)
    twoFactorLogin: {
      type: twoFactorLoginSchema,
      default: undefined, // keeps document clean when unused
      select: false, // ✅ never return any of it by default
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });

// Clean JSON output (extra safety)
userSchema.method("toJSON", function () {
  const obj = this.toObject({ virtuals: true });

  delete obj.passwordHash;
  delete obj.twoFactorSecret;
  delete obj.twoFactorLogin;
  delete obj.__v;

  return obj;
});

module.exports = mongoose.model("User", userSchema);
