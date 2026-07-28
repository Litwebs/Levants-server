const Joi = require("joi");
const {
  BUSINESS_LOGO_MAX_DATA_URL_LENGTH,
} = require("../config/uploadLimits");

const base64Image = Joi.string()
  .max(BUSINESS_LOGO_MAX_DATA_URL_LENGTH)
  .pattern(/^data:image\/[a-zA-Z0-9.+-]+;base64,/);

const uploadedLogo = Joi.object({
  dataUrl: base64Image.required(),
  originalName: Joi.string().trim().max(255).required(),
}).unknown(false);

const updateBusinessInfoSchema = Joi.object({
  companyName: Joi.string().trim().min(2).max(200).optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().optional(),
  address: Joi.string().trim().max(500).optional(),
  logo: Joi.alternatives()
    .try(base64Image, uploadedLogo, Joi.valid(null), Joi.valid(""))
    .optional(),
})
  .min(1)
  .unknown(false);

module.exports = {
  updateBusinessInfoSchema,
};
