// src/validators/productVariants.admin.validators.js
const Joi = require("joi");

const createVariantSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  description: Joi.string().allow("").max(5000).optional(),
  ingredients: Joi.string().allow("").max(5000).optional(),
  allergens: Joi.array()
    .items(Joi.string().trim().min(1).max(200))
    .max(50)
    .optional(),
  nutritionalInformation: Joi.string().allow("").max(10000).optional(),
  sku: Joi.string().min(2).max(50).required(),
  price: Joi.number().min(0).required(),
  stockQuantity: Joi.number().min(0).required(),
  lowStockAlert: Joi.number().min(0).optional(),
  thumbnailImage: Joi.string().min(1).required(),
  status: Joi.string().valid("active", "inactive").optional(),
}).unknown(false);

const updateVariantSchema = Joi.object({
  name: Joi.string().min(2).max(100).optional(),
  description: Joi.string().allow("").max(5000).optional(),
  ingredients: Joi.string().allow("").max(5000).optional(),
  allergens: Joi.array()
    .items(Joi.string().trim().min(1).max(200))
    .max(50)
    .optional(),
  nutritionalInformation: Joi.string().allow("").max(10000).optional(),
  sku: Joi.string().min(2).max(50).optional(),
  price: Joi.number().min(0).optional(),
  stockQuantity: Joi.number().min(0).optional(),
  lowStockAlert: Joi.number().min(0).optional(),
  thumbnailImage: Joi.alternatives()
    .try(Joi.string().min(1), Joi.valid(null), Joi.valid(""))
    .optional(),
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

const searchVariantsQuerySchema = Joi.object({
  q: Joi.string().trim().min(1).required(),
  limit: Joi.number().integer().min(1).max(25).default(10),
}).unknown(false);

module.exports = {
  createVariantSchema,
  updateVariantSchema,
  listVariantsQuerySchema,
  searchVariantsQuerySchema,
};
