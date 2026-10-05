const Joi = require("joi");

const objectId = Joi.string().hex().length(24);
const imageField = Joi.alternatives()
  .try(objectId, Joi.string().max(7_000_000).pattern(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/))
  .allow(null, "")
  .optional();

const dealItemSchema = Joi.object({
  variantId: objectId.required(),
  quantity: Joi.number().integer().min(1).max(999).required(),
}).unknown(false);

const createDealSchema = Joi.object({
  name: Joi.string().trim().min(2).max(140).required(),
  slug: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(160)
    .optional(),
  description: Joi.string().trim().max(3000).allow("").optional(),
  image: imageField,
  items: Joi.array().items(dealItemSchema).min(1).max(30).required(),
  packagePrice: Joi.number().precision(2).positive().required(),
  currency: Joi.string().trim().uppercase().valid("GBP").default("GBP"),
  isActive: Joi.boolean().default(true),
  isFeatured: Joi.boolean().default(false),
  startsAt: Joi.date().iso().allow(null).optional(),
  endsAt: Joi.date().iso().allow(null).optional(),
  sortOrder: Joi.number().integer().min(0).max(9999).default(0),
}).unknown(false);

const updateDealSchema = Joi.object({
  name: Joi.string().trim().min(2).max(140).optional(),
  slug: Joi.string()
    .trim()
    .lowercase()
    .pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(160)
    .optional(),
  description: Joi.string().trim().max(3000).allow("").optional(),
  image: imageField,
  items: Joi.array().items(dealItemSchema).min(1).max(30).optional(),
  packagePrice: Joi.number().precision(2).positive().optional(),
  currency: Joi.string().trim().uppercase().valid("GBP").optional(),
  isActive: Joi.boolean().optional(),
  isFeatured: Joi.boolean().optional(),
  startsAt: Joi.date().iso().allow(null).optional(),
  endsAt: Joi.date().iso().allow(null).optional(),
  sortOrder: Joi.number().integer().min(0).max(9999).optional(),
})
  .min(1)
  .unknown(false);

const listDealsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(100).optional(),
  featured: Joi.boolean().optional(),
}).unknown(false);

const dealIdParamSchema = Joi.object({
  dealId: objectId.required(),
}).unknown(false);

const dealSlugParamSchema = Joi.object({
  slug: Joi.string().trim().lowercase().min(1).max(160).required(),
}).unknown(false);

module.exports = {
  catalogQuerySchema: Joi.object({
    q: Joi.string().trim().max(100).allow("").default(""),
    page: Joi.number().integer().min(1).default(1),
    pageSize: Joi.number().integer().min(1).max(24).default(8),
    inStock: Joi.boolean().default(false),
  }).unknown(false),
  createDealSchema,
  updateDealSchema,
  listDealsQuerySchema,
  dealIdParamSchema,
  dealSlugParamSchema,
};
