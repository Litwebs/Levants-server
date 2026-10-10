"use strict";
const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  subscription: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription", required: true, index: true },
  state: { type: String, enum: ["held", "consumed", "released"], required: true },
  items: { type: [mongoose.Schema.Types.Mixed], required: true },
  remaining: { type: [mongoose.Schema.Types.Mixed], required: true },
  consumptions: { type: [mongoose.Schema.Types.Mixed], default: [] },
}, { timestamps: true });
schema.index({ state: 1 });
require("../utils/subscriptionLease.util").leaseFencingPlugin(schema);
module.exports = mongoose.model("SubscriptionStockReservation", schema);
