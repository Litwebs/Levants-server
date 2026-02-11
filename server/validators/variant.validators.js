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

const listVariantsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().valid("active", "inactive", "all").default("active"),
  search: Joi.string().allow("").max(100).optional(),
}).unknown(false);

module.exports = {
  createVariantSchema,
  updateVariantSchema,
  listVariantsQuerySchema,
};
