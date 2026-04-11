const mongoose = require("mongoose");

const routeGenerationWarningSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    message: { type: String, required: true },
    orderId: { type: String },
    orderDbId: { type: String },
    driverId: { type: String },
    driverIds: { type: [String], default: [] },
    postcode: { type: String },
  },
  { _id: false },
);

const routeGenerationDriverConfigSchema = new mongoose.Schema(
  {
    driverId: { type: String, required: true },
    driverName: { type: String },
    postcodeAreas: { type: [String], default: [] },
    routeStartTime: { type: String },
  },
  { _id: false },
);

const routeGenerationSchema = new mongoose.Schema(
  {
    warnings: {
      type: [routeGenerationWarningSchema],
      default: [],
    },
    driverConfigs: {
      type: [routeGenerationDriverConfigSchema],
      default: [],
    },
  },
  { _id: false },
);

const deliveryBatchSchema = new mongoose.Schema(
  {
    deliveryDate: {
      type: Date,
      required: true,
      index: true,
    },

    deliveryWindowStart: {
      type: String,
    },

    deliveryWindowEnd: {
      type: String,
    },

    status: {
      type: String,
      enum: [
        "collecting",
        "locked",
        "routes_generated",
        "dispatched",
        "completed",
      ],
      default: "collecting",
      index: true,
    },

    orders: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
    ],

    routes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Route",
      },
    ],

    lockedAt: {
      type: Date,
    },

    generatedAt: {
      type: Date,
    },

    dispatchedAt: {
      type: Date,
    },

    completedAt: {
      type: Date,
    },

    // Optional: metadata about imported spreadsheet orders attached to this batch
    orderImport: {
      originalName: { type: String },
      mimeType: { type: String },
      sizeBytes: { type: Number },
      detectedType: { type: String },
      uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      uploadedAt: { type: Date },
      rowsCount: { type: Number },
      createdOrdersCount: { type: Number },
    },

    routeGeneration: {
      type: routeGenerationSchema,
      default: () => ({ warnings: [], driverConfigs: [] }),
    },
  },
  { timestamps: true },
);

deliveryBatchSchema.index({ deliveryDate: 1, status: 1 });

module.exports = mongoose.model("DeliveryBatch", deliveryBatchSchema);
