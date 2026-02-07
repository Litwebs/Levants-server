// src/validators/products.admin.validators.js
const Joi = require("joi");

const createProductSchema = Joi.object({
  name: Joi.string().min(2).max(150).required(),
  category: Joi.string().min(2).max(100).required(),
  description: Joi.string().min(10).required(),
  status: Joi.string().valid("draft", "active", "archived").default("draft"),
  allergens: Joi.array().items(Joi.string()).optional(),
  storageNotes: Joi.string().allow("").optional(),

  thumbnailImage: Joi.string().uri().required(),
  galleryImages: Joi.array().items(Joi.string().uri()).max(10).optional(),
}).unknown(false);

const updateProductSchema = Joi.object({
  name: Joi.string().min(2).max(150).optional(),
  category: Joi.string().min(2).max(100).optional(),
  description: Joi.string().min(10).optional(),
  status: Joi.string().valid("draft", "active", "archived").optional(),

  allergens: Joi.array().items(Joi.string()).optional(),
  storageNotes: Joi.string().allow("").optional(),

  thumbnailImage: Joi.string().uri().optional(),
  galleryImages: Joi.array().items(Joi.string().uri()).max(10).optional(),
})
  .min(1)
  .unknown(false);

publicProductsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(50).default(12),

  category: Joi.string().trim().optional(),

  minPrice: Joi.number().min(0).optional(),
  maxPrice: Joi.number().min(0).optional(),

  inStock: Joi.boolean().default(true),

  search: Joi.string().trim().min(2).optional(),

  sort: Joi.string()
    .valid("newest", "price_asc", "price_desc", "name_asc", "name_desc")
    .default("newest"),
}).unknown(false);

module.exports = {
  createProductSchema,
  updateProductSchema,
  publicProductsQuerySchema,
};
