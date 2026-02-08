const Joi = require("joi");

const addressSchema = Joi.object({
  line1: Joi.string().trim().required(),
  line2: Joi.string().trim().allow(null, "").optional(),
  city: Joi.string().trim().required(),
  postcode: Joi.string().trim().required(),
  country: Joi.string().trim().required(),
  isDefault: Joi.boolean().optional(),
}).unknown(false);

const createCustomerSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  firstName: Joi.string().trim().min(1).max(100).required(),
  lastName: Joi.string().trim().min(1).max(100).required(),
  phone: Joi.string().optional(),
  address: addressSchema.required(),
}).unknown(false);

const createGuestCustomerSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  firstName: Joi.string().trim().min(1).max(100).optional(),
  lastName: Joi.string().trim().min(1).max(100).optional(),
  phone: Joi.string().optional(),
  address: addressSchema.optional(),
}).unknown(false);

const updateCustomerSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(100).optional(),
  lastName: Joi.string().trim().min(1).max(100).optional(),
  phone: Joi.string().optional(),
  address: addressSchema.optional(),
})
  .min(1)
  .unknown(false);

const listCustomersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().min(2).optional(),
}).unknown(false);

module.exports = {
  createCustomerSchema,
  createGuestCustomerSchema,
  updateCustomerSchema,
  listCustomersQuerySchema,
};
