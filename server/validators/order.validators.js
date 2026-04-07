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

  customerInstructions: Joi.string()
    .trim()
    .max(1000)
    .allow(null, "")
    .optional(),

  deliveryDate: Joi.date().iso().greater("now").optional(),

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

  // Optional proof photo URL to include in the delivered email
  // Stored under order.metadata.deliveryProofUrl
  deliveryProofUrl: Joi.string().uri().max(2048).allow(null, "").optional(),

  // Optional note left by delivery users; stored under order.metadata.deliveryNote
  deliveryNote: Joi.string().trim().max(500).allow(null, "").optional(),
}).unknown(false);

const updateOrderPaymentSchema = Joi.object({
  paid: Joi.boolean().required(),
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

const bulkAssignDeliveryDateSchema = Joi.object({
  orderIds: Joi.array()
    .items(Joi.string().trim().length(24).hex().required())
    .min(1)
    .required(),

  deliveryDate: Joi.date().iso().required(),
}).unknown(false);

module.exports = {
  createOrderSchema,
  updateOrderStatusSchema,
  updateOrderPaymentSchema,
  bulkUpdateDeliveryStatusSchema,
  bulkAssignDeliveryDateSchema,
};
