"use strict";

const mongoose = require("mongoose");

const supportNoteSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    isInternal: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const supportRequestSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },

    relatedOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },

    relatedSubscription: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subscription",
      default: null,
      index: true,
    },

    issueType: {
      type: String,
      enum: [
        "order_issue",
        "delivery_issue",
        "subscription_issue",
        "payment_issue",
        "product_issue",
        "account_issue",
        "general_enquiry",
        "other",
      ],
      required: true,
    },

    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000,
    },

    status: {
      type: String,
      enum: ["open", "in_review", "resolved", "closed"],
      default: "open",
      index: true,
    },

    // Internal staff notes
    notes: {
      type: [supportNoteSchema],
      default: [],
    },

    resolvedAt: {
      type: Date,
      default: null,
    },

    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

supportRequestSchema.index({ customer: 1, createdAt: -1 });
supportRequestSchema.index({ status: 1, createdAt: -1 });

supportRequestSchema.method("toJSON", function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
});

module.exports = mongoose.model("SupportRequest", supportRequestSchema);
