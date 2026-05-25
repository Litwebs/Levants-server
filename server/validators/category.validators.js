const Joi = require("joi");

const objectId = Joi.string().hex().length(24);
const imageField = Joi.alternatives()
  .try(objectId, Joi.string().pattern(/^data:image\//))
  .allow(null)
  .optional();

const createCategorySchema = Joi.object({
  title: Joi.string().trim().min(1).max(120).required(),
  subtitle: Joi.string().trim().max(300).allow("").optional(),
  image: imageField,
}).unknown(false);

const updateCategorySchema = Joi.object({
  title: Joi.string().trim().min(1).max(120).optional(),
  subtitle: Joi.string().trim().max(300).allow("").optional(),
  image: imageField,
})
  .min(1)
  .unknown(false);

module.exports = {
  createCategorySchema,
  updateCategorySchema,
};
