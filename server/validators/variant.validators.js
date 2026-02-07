// src/validators/productVariants.admin.validators.js
const Joi = require("joi");

const createVariantSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  sku: Joi.string().min(2).max(50).required(),
  price: Joi.number().min(0).required(),
  stockQuantity: Joi.number().min(0).required(),
  lowStockAlert: Joi.number().min(0).optional(),
  thumbnailImage: Joi.string().min(1).required(),
  status: Joi.string().valid("active", "inactive").optional(),
}).unknown(false);

const updateVariantSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  sku: Joi.string().min(2).max(50).optional(),
  price: Joi.number().min(0).optional(),
  stockQuantity: Joi.number().min(0).optional(),
  lowStockAlert: Joi.number().min(0).optional(),
  thumbnailImage: Joi.string().min(1).optional(),
  status: Joi.string().valid("active", "inactive").optional(),
})
  .min(1)
  .unknown(false);

module.exports = {
  createVariantSchema,
  updateVariantSchema,
};
