"use strict";
const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  subscription: { type: mongoose.Schema.Types.ObjectId, ref: "Subscription", required: true },
  invoiceId: { type: String, required: true },
  paymentIntentId: { type: String, default: null },
  billingWindowStart: { type: Date, required: true },
  billingWindowEnd: { type: Date, required: true },
  deliveries: { type: [mongoose.Schema.Types.Mixed], required: true },
  legacyReviewRequired: { type: Boolean, default: false },
  completedAt: { type: Date, default: null },
  inventoryKey: { type: String, default: null },
  inventoryBlocked: { type: Boolean, default: false },
  refundSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  refundedAt: { type: Date, default: null },
}, { timestamps: true });
schema.index({ subscription: 1, invoiceId: 1 }, { unique: true });
schema.index({ subscription: 1, completedAt: 1 });
require("../utils/subscriptionLease.util").leaseFencingPlugin(schema);

module.exports = mongoose.model("SubscriptionInvoiceFulfillment", schema);
