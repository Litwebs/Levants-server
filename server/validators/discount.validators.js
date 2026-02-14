const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const createDiscountSchema = Joi.object({
  name: Joi.string().trim().min(2).max(120).required(),

  code: Joi.string().trim().uppercase().min(3).max(32).optional(),

  kind: Joi.string().valid("percent", "amount").required(),
  percentOff: Joi.when("kind", {
    is: "percent",
    then: Joi.number().min(1).max(100).required(),
    otherwise: Joi.forbidden(),
  }),
  amountOff: Joi.when("kind", {
    is: "amount",
    then: Joi.number().min(0.01).required(),
    otherwise: Joi.forbidden(),
  }),
  currency: Joi.when("kind", {
    is: "amount",
    then: Joi.string().trim().min(3).max(3).default("GBP"),
    otherwise: Joi.string().trim().min(3).max(3).default("GBP"),
  }),

  scope: Joi.string().valid("global", "category", "variant").default("global"),

  category: Joi.when("scope", {
    is: "category",
    then: Joi.string().trim().min(1).max(80).required(),
    otherwise: Joi.forbidden(),
  }),

  variantIds: Joi.when("scope", {
    is: "variant",
    then: Joi.array().items(objectId.required()).min(1).required(),
    otherwise: Joi.forbidden(),
  }),

  startsAt: Joi.date().iso().optional(),
  endsAt: Joi.date().iso().optional(),

  maxRedemptions: Joi.number().integer().min(1).optional(),
  perCustomerLimit: Joi.number().integer().min(1).optional(),
}).unknown(false);

module.exports = {
  createDiscountSchema,
};
