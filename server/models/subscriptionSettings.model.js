"use strict";

const mongoose = require("mongoose");

/**
 * Global subscription settings (singleton).
 *
 * Controls:
 *  - Which weekdays deliveries are available (customers pick from these).
 *  - The modification cut-off, expressed as "N days before the delivery date
 *    at HH:MM". Before the cut-off, edits apply to the upcoming delivery and
 *    increases are charged immediately. After the cut-off, edits apply to the
 *    following delivery instead.
 */
const subscriptionSettingsSchema = new mongoose.Schema(
  {
    // Singleton marker (mirrors businessInfo pattern).
    singletonKey: {
      type: String,
      default: "subscription-settings",
      immutable: true,
      unique: true,
      index: true,
    },

    // Weekdays deliveries are available on. 0 = Sunday … 6 = Saturday.
    deliveryDays: {
      type: [Number],
      default: [0, 3], // Sunday & Wednesday
      validate: {
        validator: (arr) =>
          Array.isArray(arr) &&
          arr.length > 0 &&
          arr.every((d) => Number.isInteger(d) && d >= 0 && d <= 6),
        message: "deliveryDays must be a non-empty list of weekdays (0-6)",
      },
    },

    // How many days before the delivery date the cut-off falls.
    cutoffDaysBefore: {
      type: Number,
      default: 2,
      min: 0,
      max: 7,
    },

    // Time of day of the cut-off, "HH:MM" 24h.
    cutoffTime: {
      type: String,
      default: "22:00",
      match: /^([01]\d|2[0-3]):([0-5]\d)$/,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model(
  "SubscriptionSettings",
  subscriptionSettingsSchema,
);
