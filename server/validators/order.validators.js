const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const createOrderSchema = Joi.object({
  customerId: objectId.required(),

  discountCode: Joi.string().trim().uppercase().min(3).max(32).optional(),

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
  deliveryStatus: Joi.string()
    .valid("ordered", "dispatched", "in_transit", "delivered", "returned")
    .required(),
}).unknown(false);

const bulkUpdateDeliveryStatusSchema = Joi.object({
  orderIds: Joi.array()
    .items(Joi.string().trim().length(24).hex().required())
    .min(1)
    .required(),

  deliveryStatus: Joi.string()
    .valid("ordered", "dispatched", "in_transit", "delivered", "returned")
    .required(),
});

module.exports = {
  createOrderSchema,
  updateOrderStatusSchema,
  bulkUpdateDeliveryStatusSchema,
};
