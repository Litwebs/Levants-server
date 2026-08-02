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

const audienceSchema = new mongoose.Schema(
  {
    customerTypes: { type: [String], default: undefined },
    joinedFrom: { type: Date, default: null },
    joinedTo: { type: Date, default: null },
    lastOrderFrom: { type: Date, default: null },
    lastOrderTo: { type: Date, default: null },
    postcodes: { type: [String], default: undefined },
    marketingPreference: {
      type: String,
      enum: ["any", "opted_in", "opted_out"],
      default: "any",
    },
    orderStatuses: { type: [String], default: undefined },
    deliveryStatuses: { type: [String], default: undefined },
    orderTypes: { type: [String], default: undefined },
    orderedFrom: { type: Date, default: null },
    orderedTo: { type: Date, default: null },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    variantIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "ProductVariant" }],
    hasSubscription: {
      type: String,
      enum: ["any", "yes", "no"],
      default: "any",
    },
    subscriptionStatuses: { type: [String], default: undefined },
    subscriptionFrequencies: { type: [String], default: undefined },
    deliveryDays: { type: [Number], default: undefined },
  },
  { _id: false },
);

const audienceSummarySchema = new mongoose.Schema(
  {
    estimatedRecipients: { type: Number, default: 0, min: 0 },
    guests: { type: Number, default: 0, min: 0 },
    accounts: { type: Number, default: 0, min: 0 },
    marketingOptIn: { type: Number, default: 0, min: 0 },
    calculatedAt: { type: Date, default: null },
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

    messageType: {
      type: String,
      enum: ["operational", "marketing"],
      default: "operational",
      index: true,
    },

    audience: {
      type: audienceSchema,
      default: () => ({}),
    },

    audienceSummary: {
      type: audienceSummarySchema,
      default: () => ({}),
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
