// src/models/session.model.js
const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Store a hash of the refresh token, not the raw token
    refreshTokenHash: {
      type: String,
      required: true,
    },

    userAgent: {
      type: String,
    },

    ip: {
      type: String,
    },

    // When this specific session should expire
    expiresAt: {
      type: Date,
      required: true,
    },

    // For marking a session as revoked before expiry
    revokedAt: {
      type: Date,
    },

    revokedReason: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// TTL index (MongoDB will auto-delete when expiresAt is in the past)
// NOTE: this only works if `expiresAt` is a real Date and you actually
// start mongod with TTL monitor (default behaviour).
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Helper to mark session as revoked (without deleting immediately)
sessionSchema.methods.revoke = function (reason = "revoked") {
  this.revokedAt = new Date();
  this.revokedReason = reason;
  return this.save();
};

module.exports = mongoose.model("Session", sessionSchema);
