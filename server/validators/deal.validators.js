const Joi = require("joi");
const { parseDealImageData } = require("../utils/dealImage.util");

const objectId = Joi.string().hex().length(24);
const imageField = Joi.alternatives()
  .try(objectId, Joi.string().max(7_000_000).custom((value, helpers) => {
    try { parseDealImageData(value); return value; }
    catch (error) { return helpers.message(error.message); }
  }))
  .allow(null, "")
  .optional();

const dealItemSchema = Joi.object({
  variantId: objectId.required(),
  quantity: Joi.number().integer().min(1).max(999).required(),
}).unknown(false);

const pricingMode = Joi.string().valid("fixed_price", "fixed_saving", "percentage_saving");
const savingValue = Joi.number().precision(2).positive().allow(null);

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
  publicationStatus: Joi.string().valid("draft", "published").default("published"),
  pricingMode: pricingMode.default("fixed_price"),
  savingValue: savingValue.when("pricingMode", { is: "percentage_saving", then: Joi.number().less(100) }),
  items: Joi.array().items(dealItemSchema).max(30).when("publicationStatus", { is: "draft", then: Joi.optional(), otherwise: Joi.array().min(1).required() }),
  packagePrice: Joi.number().precision(2).positive().allow(null).when("publicationStatus", { is: "draft", then: Joi.optional(), otherwise: Joi.when("pricingMode", { is: "fixed_price", then: Joi.number().required().invalid(null), otherwise: Joi.optional() }) }),
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
  pricingMode: pricingMode.optional(),
  savingValue: savingValue.optional(),
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
  search: Joi.string().trim().max(100).allow("").optional(),
  status: Joi.string()
    .valid("all", "active", "inactive", "featured", "archived", "draft", "published")
    .optional(),
  sort: Joi.string()
    .valid("newest", "oldest", "name", "price-high", "price-low")
    .optional(),
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
    pageSize: Joi.number().integer().min(1).max(50).default(20),
    inStock: Joi.boolean().default(false),
    category: Joi.string().trim().max(120).allow("").default(""),
    stock: Joi.string()
      .valid("all", "in_stock", "low_stock", "out_of_stock")
      .default("all"),
    sort: Joi.string()
      .valid("newest", "name_asc", "price_asc", "price_desc", "stock_desc")
      .default("newest"),
  }).unknown(false),
  createDealSchema,
  updateDealSchema,
  listDealsQuerySchema,
  dealIdParamSchema,
  dealSlugParamSchema,
};
