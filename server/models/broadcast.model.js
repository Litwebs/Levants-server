const mongoose = require("mongoose");

const emailStatsSchema = new mongoose.Schema(
  {
    totalRecipients: { type: Number, default: 0, min: 0 },
    sent: { type: Number, default: 0, min: 0 },
    failed: { type: Number, default: 0, min: 0 },
    lastError: { type: String, default: null, trim: true, maxlength: 500 },
  },
  { _id: false },
);

const broadcastSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 2000,
    },

    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },

    expiresAt: {
      type: Date,
      index: true,
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    emailSubject: {
      type: String,
      trim: true,
      maxlength: 160,
      default: "",
    },

    emailStatus: {
      type: String,
      enum: ["not_sent", "sending", "sent", "failed", "partial"],
      default: "not_sent",
      index: true,
    },

    emailedAt: {
      type: Date,
      default: null,
    },

    emailedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    emailStats: {
      type: emailStatsSchema,
      default: () => ({}),
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Broadcast", broadcastSchema);
