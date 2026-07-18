"use strict";

const Joi = require("joi");

const updateSubscriptionSettingsSchema = Joi.object({
  deliveryDays: Joi.array()
    .items(Joi.number().integer().min(0).max(6))
    .min(1)
    .optional(),
  cutoffDaysBefore: Joi.number().integer().min(0).max(7).optional(),
  cutoffTime: Joi.string()
    .pattern(/^([01]\d|2[0-3]):([0-5]\d)$/)
    .optional()
    .messages({ "string.pattern.base": "cutoffTime must be in HH:MM format" }),
})
  .min(1)
  .unknown(false);

module.exports = {
  updateSubscriptionSettingsSchema,
};
