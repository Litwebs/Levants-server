// src/models/passwordResetToken.model.js
const mongoose = require("mongoose");

/**
 * PasswordResetToken
 *
 * One-time tokens for "Forgot password" flow.
 * - Store a hashed token (never the raw token).
 * - Limit lifetime via expiresAt + TTL index.
 * - Mark used tokens so they can't be reused.
 */

const passwordResetTokenSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Store ONLY a hash of the reset token (e.g. SHA256(rawToken)).
    tokenHash: {
      type: String,
      required: true,
      index: true,
    },

    // When this token expires
    expiresAt: {
      type: Date,
      required: true,
    },

    // If the token has already been used
    usedAt: {
      type: Date,
    },

    // For logging / debugging
    ip: {
      type: String,
      trim: true,
    },

    userAgent: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  },
);

// TTL index: MongoDB will delete documents after expiresAt
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Helper to mark token as used
passwordResetTokenSchema.methods.markUsed = function () {
  this.usedAt = new Date();
  return this.save();
};

// Helper to check if token is still valid (time + not used)
passwordResetTokenSchema.methods.isValid = function () {
  const now = new Date();
  const notExpired = this.expiresAt > now;
  const notUsed = !this.usedAt;
  return notExpired && notUsed;
};

module.exports = mongoose.model("PasswordResetToken", passwordResetTokenSchema);
