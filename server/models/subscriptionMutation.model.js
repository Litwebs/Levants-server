"use strict";

const mongoose = require("mongoose");

const subscriptionMutationSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    subscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
      index: true,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    operationId: {
      type: String,
      required: true,
      trim: true,
    },
    mutationType: {
      type: String,
      required: true,
      trim: true,
    },
    workerToken: { type: String, default: null },
    requestHash: {
      type: String,
      required: true,
    },
    requestPayload: { type: mongoose.Schema.Types.Mixed, default: null, select: false },
    status: {
      type: String,
      enum: ["processing", "completed", "failed"],
      default: "processing",
      index: true,
    },
    itemIncreaseSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    decreaseRefundSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    addOnSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    creationSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    response: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    lastError: {
      type: String,
      default: null,
    },
    lockedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    attempts: {
      type: Number,
      default: 1,
      min: 1,
    },
  },
  { timestamps: true },
);

subscriptionMutationSchema.index(
  { customer: 1, operationId: 1 },
  { unique: true },
);
subscriptionMutationSchema.index({ status: 1, lockedAt: 1 });

require("../utils/subscriptionLease.util").leaseFencingPlugin(subscriptionMutationSchema);

module.exports = mongoose.model("SubscriptionMutation", subscriptionMutationSchema);
