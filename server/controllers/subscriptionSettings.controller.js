"use strict";

const subscriptionSettingsService = require("../services/subscriptionSettings.service");
const { sendOk } = require("../utils/response.util");

const GetSubscriptionSettings = async (req, res, next) => {
  const result = await subscriptionSettingsService.getSettings();
  if (result.error) return next(result.error);
  return sendOk(res, { settings: result.data });
};

const UpdateSubscriptionSettings = async (req, res, next) => {
  const result = await subscriptionSettingsService.updateSettings({
    data: req.body,
    userId: req.user?.id,
  });
  if (result.error) return next(result.error);
  return sendOk(res, { settings: result.data });
};

module.exports = {
  GetSubscriptionSettings,
  UpdateSubscriptionSettings,
};
