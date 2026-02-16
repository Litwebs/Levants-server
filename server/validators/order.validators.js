const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const deliveryAddressSchema = Joi.object({
  line1: Joi.string().trim().min(3).max(255).required(),
  line2: Joi.string().trim().max(255).allow(null, "").optional(),
  city: Joi.string().trim().min(2).max(100).required(),
  postcode: Joi.string().trim().min(3).max(20).required(),
  country: Joi.string().trim().min(2).max(100).required(),
});

const createOrderSchema = Joi.object({
  customerId: objectId.required(),

  discountCode: Joi.string().trim().uppercase().min(3).max(32).optional(),

  deliveryAddress: deliveryAddressSchema.required(),

  // deliveryDate: Joi.date().iso().greater("now").required(),

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
