const Joi = require("joi");

const updateBusinessInfoSchema = Joi.object({
  companyName: Joi.string().trim().min(2).max(200).optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().optional(),
  address: Joi.string().trim().max(500).optional(),
})
  .min(1)
  .unknown(false);

module.exports = {
  updateBusinessInfoSchema,
};
