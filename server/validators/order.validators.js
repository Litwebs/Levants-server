const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const createOrderSchema = Joi.object({
  customerId: objectId.required(),

  items: Joi.array()
    .items(
      Joi.object({
        variantId: objectId.required(),
        quantity: Joi.number().integer().min(1).required(),
      }),
    )
    .min(1)
    .required(),
}).unknown(false);

const updateOrderStatusSchema = Joi.object({
  status: Joi.string()
    .valid("pending", "paid", "cancelled", "refunded")
    .required(),
}).unknown(false);

module.exports = {
  createOrderSchema,
  updateOrderStatusSchema,
};
