"use strict";

const SubscriptionSettings = require("../models/subscriptionSettings.model");

const SINGLETON_KEY = "subscription-settings";

const DEFAULTS = {
  deliveryDays: [0, 3],
  cutoffDaysBefore: 2,
  cutoffTime: "22:00",
};

/**
 * Returns the settings document, creating it with defaults on first access
 * so the rest of the system can always rely on a value being present.
 */
async function getOrCreateSettings() {
  let settings = await SubscriptionSettings.findOne({
    singletonKey: SINGLETON_KEY,
  });

  if (!settings) {
    settings = await SubscriptionSettings.create({
      singletonKey: SINGLETON_KEY,
      ...DEFAULTS,
    });
  }

  return settings;
}

async function getSettings() {
  const settings = await getOrCreateSettings();
  return { data: settings };
}

async function updateSettings({ data, userId }) {
  const settings = await getOrCreateSettings();

  if (data.deliveryDays !== undefined) {
    // Normalise: unique, sorted, valid weekdays only.
    const cleaned = Array.from(
      new Set(
        (data.deliveryDays || [])
          .map((d) => Number(d))
          .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6),
      ),
    ).sort((a, b) => a - b);

    if (cleaned.length === 0) {
      return {
        error: {
          statusCode: 400,
          message: "Select at least one delivery day",
        },
      };
    }
    settings.deliveryDays = cleaned;
  }

  if (data.cutoffDaysBefore !== undefined) {
    settings.cutoffDaysBefore = data.cutoffDaysBefore;
  }

  if (data.cutoffTime !== undefined) {
    settings.cutoffTime = data.cutoffTime;
  }

  settings.updatedBy = userId || null;
  await settings.save();

  return { data: settings };
}

module.exports = {
  getOrCreateSettings,
  getSettings,
  updateSettings,
  DEFAULTS,
};
