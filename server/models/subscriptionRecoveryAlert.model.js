"use strict";
const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  _id: String,
  namespace: { type: String, required: true },
  active: { type: Boolean, default: true },
  notified: { type: Boolean, default: false },
  generation: { type: Number, default: 0 },
  lastSeenAt: Date,
  claimOwner: String,
  claimUntil: Date,
  requestKey: String,
  payload: mongoose.Schema.Types.Mixed,
  firstAttemptAt: Date,
  lastAttemptAt: Date,
  notifiedAt: Date,
  providerId: String,
  lastResult: String,
}, { versionKey: false, timestamps: false });
module.exports = mongoose.model("SubscriptionRecoveryAlert", schema);
