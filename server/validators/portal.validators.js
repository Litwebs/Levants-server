"use strict";

const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const createAddressSchema = Joi.object({
  label: Joi.string().trim().max(60).allow(null, "").optional(),
  fullName: Joi.string().trim().max(100).allow(null, "").optional(),
  phone: Joi.string().trim().max(30).allow(null, "").optional(),
  line1: Joi.string().trim().min(3).max(255).required(),
  line2: Joi.string().trim().max(255).allow(null, "").optional(),
  city: Joi.string().trim().min(2).max(100).required(),
  postcode: Joi.string().trim().min(3).max(20).required(),
  country: Joi.string().trim().min(2).max(100).required(),
  deliveryInstructions: Joi.string().trim().max(500).allow(null, "").optional(),
  isDefault: Joi.boolean().optional(),
}).unknown(false);

const updateAddressSchema = createAddressSchema;

const addressIdParamSchema = Joi.object({
  addressId: objectId.required(),
}).unknown(true);

const createSubscriptionSchema = Joi.object({
  frequency: Joi.string()
    .valid("weekly", "every_two_weeks", "monthly")
    .required(),
  preferredDeliveryDay: Joi.number().integer().min(0).max(6).optional(),
  preferredDeliveryDays: Joi.array()
    .items(Joi.number().integer().min(0).max(6))
    .min(1)
    .unique()
    .optional(),
  deliveryAddressId: objectId.required(),
  deliveryInstructions: Joi.string().trim().max(500).allow(null, "").optional(),
  notes: Joi.string().trim().max(1000).allow(null, "").optional(),
  items: Joi.array()
    .items(
      Joi.object({
        variantId: objectId.required(),
        quantity: Joi.number().integer().min(1).required(),
      }),
    )
    .min(1)
    .optional(),
  deliveryDayPlans: Joi.array()
    .items(
      Joi.object({
        day: Joi.number().integer().min(0).max(6).required(),
        items: Joi.array()
          .items(
            Joi.object({
              variantId: objectId.required(),
              quantity: Joi.number().integer().min(1).required(),
            }),
          )
          .min(1)
          .required(),
      }).unknown(false),
    )
    .min(1)
    .optional(),
})
  .or("items", "deliveryDayPlans")
  .or("preferredDeliveryDay", "preferredDeliveryDays")
  .unknown(false);

const updateSubscriptionSchema = Joi.object({
  frequency: Joi.string()
    .valid("weekly", "every_two_weeks", "monthly")
    .optional(),
  preferredDeliveryDay: Joi.number().integer().min(0).max(6).optional(),
  preferredDeliveryDays: Joi.array()
    .items(Joi.number().integer().min(0).max(6))
    .min(1)
    .unique()
    .optional(),
  deliveryDayPlans: Joi.array()
    .items(
      Joi.object({
        day: Joi.number().integer().min(0).max(6).required(),
        items: Joi.array()
          .items(
            Joi.object({
              variantId: objectId.required(),
              quantity: Joi.number().integer().min(1).required(),
            }),
          )
          .min(1)
          .required(),
      }).unknown(false),
    )
    .min(1)
    .optional(),
  changedDeliveryDays: Joi.array()
    .items(Joi.number().integer().min(0).max(6))
    .min(1)
    .unique()
    .optional(),
  deliveryAddressId: objectId.optional(),
  notes: Joi.string().trim().max(1000).allow(null, "").optional(),
  refundMethod: Joi.string().valid("credit", "refund").optional(),
}).unknown(false);

const subscriptionItemSchema = Joi.object({
  variantId: objectId.required(),
  quantity: Joi.number().integer().min(1).required(),
  refundMethod: Joi.string().valid("credit", "refund").optional(),
}).unknown(false);

const updateSubscriptionItemSchema = Joi.object({
  quantity: Joi.number().integer().min(1).required(),
  refundMethod: Joi.string().valid("credit", "refund").optional(),
}).unknown(false);

const subscriptionIdParamSchema = Joi.object({
  subscriptionId: objectId.required(),
}).unknown(true);

const subscriptionLookupIdParamSchema = Joi.object({
  subscriptionId: Joi.alternatives()
    .try(objectId, Joi.string().pattern(/^pending:[a-f\d]{24}$/i))
    .required(),
}).unknown(true);

const subscriptionItemIdParamSchema = Joi.object({
  subscriptionId: objectId.required(),
  itemId: objectId.required(),
}).unknown(true);

const cancelSubscriptionSchema = Joi.object({
  reason: Joi.string().trim().max(500).allow(null, "").optional(),
  refundMethod: Joi.string().valid("credit", "refund").optional(),
}).unknown(false);

const createSupportRequestSchema = Joi.object({
  issueType: Joi.string()
    .valid(
      "order_issue",
      "delivery_issue",
      "subscription_issue",
      "payment_issue",
      "product_issue",
      "account_issue",
      "general_enquiry",
      "other",
    )
    .required(),
  subject: Joi.string().trim().min(3).max(250).required(),
  message: Joi.string().trim().min(10).max(5000).required(),
  relatedOrderId: objectId.allow(null, "").optional(),
  relatedSubscriptionId: objectId.allow(null, "").optional(),
}).unknown(false);

const supportRequestIdParamSchema = Joi.object({
  supportRequestId: objectId.required(),
}).unknown(true);

const addSupportNoteSchema = Joi.object({
  content: Joi.string().trim().min(1).max(2000).required(),
  isInternal: Joi.boolean().optional(),
}).unknown(false);

const updateSupportStatusSchema = Joi.object({
  status: Joi.string()
    .valid("open", "in_review", "resolved", "closed")
    .required(),
  assignedTo: objectId.allow(null, "").optional(),
}).unknown(false);

const customerPortalOrderSchema = Joi.object({
  items: Joi.array()
    .items(
      Joi.object({
        variantId: objectId.required(),
        quantity: Joi.number().integer().min(1).required(),
      }),
    )
    .min(1)
    .required(),
  deliveryAddressId: objectId.required(),
  discountCode: Joi.string().trim().uppercase().min(3).max(32).optional(),
  deliveryDate: Joi.date().iso().greater("now").optional(),
  customerInstructions: Joi.string()
    .trim()
    .max(1000)
    .allow(null, "")
    .optional(),
}).unknown(false);

const cancelOrderSchema = Joi.object({
  reason: Joi.string().trim().max(500).allow(null, "").optional(),
}).unknown(false);

const updateOrderDeliverySchema = Joi.object({
  deliveryAddressId: objectId.required(),
}).unknown(false);

const updatePaymentStatusSchema = Joi.object({
  status: Joi.string()
    .valid("pending", "paid", "failed", "refunded")
    .required(),
  notes: Joi.string().trim().max(500).allow(null, "").optional(),
}).unknown(false);

const portalListQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
  status: Joi.string().optional(),
  search: Joi.string().trim().max(100).optional(),
}).unknown(true);

module.exports = {
  createAddressSchema,
  updateAddressSchema,
  addressIdParamSchema,
  createSubscriptionSchema,
  updateSubscriptionSchema,
  subscriptionItemSchema,
  updateSubscriptionItemSchema,
  subscriptionIdParamSchema,
  subscriptionLookupIdParamSchema,
  subscriptionItemIdParamSchema,
  cancelSubscriptionSchema,
  createSupportRequestSchema,
  supportRequestIdParamSchema,
  addSupportNoteSchema,
  updateSupportStatusSchema,
  customerPortalOrderSchema,
  cancelOrderSchema,
  updateOrderDeliverySchema,
  updatePaymentStatusSchema,
  portalListQuerySchema,
};
