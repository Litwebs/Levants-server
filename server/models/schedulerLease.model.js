"use strict";

const mongoose = require("mongoose");

const schedulerLeaseSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true,
      trim: true,
    },
    ownerId: {
      type: String,
      required: true,
      trim: true,
    },
    acquiredAt: {
      type: Date,
      required: true,
    },
    renewedAt: {
      type: Date,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    versionKey: false,
    timestamps: false,
  },
);

module.exports = mongoose.model("SchedulerLease", schedulerLeaseSchema);
