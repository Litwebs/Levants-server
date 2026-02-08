// src/validators/common.validators.js
const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const roleIdParamSchema = Joi.object({
  roleId: objectId.required(),
});

const userIdParamSchema = Joi.object({
  userId: objectId.required(),
});

const productIdParamSchema = Joi.object({
  productId: objectId.required(),
});
const variantIdParamSchema = Joi.object({
  variantId: objectId.required(),
});

const customerIdParamSchema = Joi.object({
  customerId: objectId.required(),
});

const orderIdParamSchema = Joi.object({
  orderId: objectId.required(),
});

module.exports = {
  roleIdParamSchema,
  userIdParamSchema,
  productIdParamSchema,
  variantIdParamSchema,
  customerIdParamSchema,
  orderIdParamSchema,
};
