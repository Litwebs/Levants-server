const Joi = require("joi");

const createAnnouncementSchema = Joi.object({
  title: Joi.string().trim().min(2).max(120).required(),
  description: Joi.string().trim().max(500).allow("").optional(),
  expiresAt: Joi.date().iso().optional(),
}).unknown(false);

const updateAnnouncementSchema = Joi.object({
  title: Joi.string().trim().min(2).max(120).optional(),
  description: Joi.string().trim().max(500).allow("").optional(),
  expiresAt: Joi.date().iso().allow(null).optional(),
  isActive: Joi.boolean().optional(),
})
  .min(1)
  .unknown(false);

module.exports = {
  createAnnouncementSchema,
  updateAnnouncementSchema,
};
