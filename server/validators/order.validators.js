const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const listOrdersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(200).default(20),
  deliveryStatus: Joi.alternatives().try(
    Joi.string().valid("ordered", "dispatched", "in_transit", "delivered", "returned"),
    Joi.array().items(Joi.string().valid("ordered", "dispatched", "in_transit", "delivered", "returned")),
  ),
  paymentStatus: Joi.alternatives().try(
    Joi.string().max(50),
    Joi.array().items(Joi.string().max(50)),
  ),
  orderSource: Joi.string().valid("all", "imported", "website", "subscription"),
  search: Joi.string().trim().max(200).allow(""),
  minTotal: Joi.number().min(0),
  maxTotal: Joi.number().min(0),
  dateFrom: Joi.date().iso(),
  dateTo: Joi.date().iso(),
  refundedOnly: Joi.boolean(),
  expiredOnly: Joi.boolean(),
  sortBy: Joi.string().valid(
    "createdAt",
    "updatedAt",
    "deliveryDate",
    "total",
    "subtotal",
    "paidAt",
    "expiresAt",
    "orderId",
    "status",
  ),
  sortOrder: Joi.string().valid("asc", "desc"),
}).custom((value, helpers) => {
  if (
    value.minTotal !== undefined &&
    value.maxTotal !== undefined &&
    value.minTotal > value.maxTotal
  ) {
    return helpers.message({ custom: "minTotal must not exceed maxTotal" });
  }
  if (value.dateFrom && value.dateTo && value.dateFrom > value.dateTo) {
    return helpers.message({ custom: "dateFrom must not be after dateTo" });
  }
  return value;
}).unknown(false);

const updateDriverNoteSchema = Joi.object({
  driverNote: Joi.string().trim().max(500).allow(null, "").required(),
}).unknown(false);

const deliveryAddressSchema = Joi.object({
  line1: Joi.string().trim().min(3).max(255).required(),
  line2: Joi.string().trim().max(255).allow(null, "").optional(),
  city: Joi.string().trim().min(2).max(100).required(),
  postcode: Joi.string().trim().min(3).max(20).required(),
  country: Joi.string().trim().min(2).max(100).required(),
});

const checkoutOrderFields = {
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

  deals: Joi.array()
    .items(
      Joi.object({
        dealId: objectId.required(),
        quantity: Joi.number().integer().min(1).max(99).required(),
        expectedPackagePrice: Joi.number().precision(2).positive().required(),
        expectedContents: Joi.array().items(Joi.object({variantId: objectId.required(), quantity: Joi.number().integer().min(1).max(999).required()}).unknown(false)).min(1).max(30).optional(),
      }).unknown(false),
    )
    .max(20)
    .optional(),
};

const createOrderSchema = Joi.object({
  customerId: objectId.required(),
  ...checkoutOrderFields,
}).unknown(false);

const authenticatedCheckoutOrderSchema = Joi.object({
  ...checkoutOrderFields,
  // Store credit is account-scoped and is only accepted on the authenticated
  // customer checkout endpoint.
  creditToApplyMinor: Joi.number().integer().min(0).optional(),
}).unknown(false);

const checkoutConfirmSchema = Joi.object({
  checkoutSessionId: Joi.string().trim().min(8).max(255).required(),
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
  amountPaid: Joi.number().min(0).optional(),
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

const updateOrderItemsSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        variantId: objectId.required(),
        quantity: Joi.number().integer().min(1).required(),
      }),
    )
    .min(1)
    .required(),
  importedBaseTotal: Joi.number().min(0).optional(),
  includeDeliveryFee: Joi.boolean().optional(),
}).unknown(false);

const bulkDeleteOrdersSchema = Joi.object({
  orderIds: Joi.array()
    .items(Joi.string().trim().length(24).hex().required())
    .min(1)
    .required(),
}).unknown(false);

module.exports = {
  listOrdersQuerySchema,
  createOrderSchema,
  authenticatedCheckoutOrderSchema,
  checkoutConfirmSchema,
  updateOrderStatusSchema,
  updateOrderPaymentSchema,
  bulkUpdateDeliveryStatusSchema,
  bulkAssignDeliveryDateSchema,
  updateOrderItemsSchema,
  bulkDeleteOrdersSchema,
  updateDriverNoteSchema,
};
