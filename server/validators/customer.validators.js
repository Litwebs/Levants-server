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

  // Checkout payloads may include order-scoped instructions; accept and ignore.
  customerInstructions: Joi.string()
    .trim()
    .max(1000)
    .allow(null, "")
    .optional(),
  instructions: Joi.string().trim().max(1000).allow(null, "").optional(),
}).unknown(false);

const createGuestCustomerSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  firstName: Joi.string().trim().min(1).max(100).optional(),
  lastName: Joi.string().trim().min(1).max(100).optional(),
  phone: Joi.string().optional(),
  address: addressSchema.optional(),

  // Checkout payloads may include order-scoped instructions; accept and ignore.
  customerInstructions: Joi.string()
    .trim()
    .max(1000)
    .allow(null, "")
    .optional(),
  instructions: Joi.string().trim().max(1000).allow(null, "").optional(),
}).unknown(false);

const updateCustomerSchema = Joi.object({
  email: Joi.string().trim().email().optional(),
  firstName: Joi.string().trim().min(1).max(100).optional(),
  lastName: Joi.string().trim().min(1).max(100).optional(),
  phone: Joi.string().trim().allow(null, "").optional(),
  status: Joi.string().valid("active", "disabled").optional(),
  address: addressSchema.optional(),
})
  .min(1)
  .unknown(false);

const listCustomersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().trim().min(1).optional(),
  type: Joi.string().valid("all", "guest", "registered").default("all"),
  sort: Joi.string()
    .valid("newest", "oldest", "name-asc", "name-desc")
    .default("newest"),
}).unknown(false);

const createCustomerOnboardingLinkSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  firstName: Joi.string().trim().min(1).max(100).required(),
  lastName: Joi.string().trim().min(1).max(100).required(),
  phone: Joi.string().trim().allow(null, "").optional(),
  address: addressSchema.optional(),
  subscription: Joi.object({
    frequency: Joi.string()
      .valid("weekly", "every_two_weeks", "monthly")
      .required(),
    preferredDeliveryDay: Joi.number().integer().min(0).max(6).required(),
    preferredDeliveryDays: Joi.array()
      .items(Joi.number().integer().min(0).max(6))
      .min(1)
      .unique()
      .optional(),
    items: Joi.array()
      .items(
        Joi.object({
          variantId: Joi.string().hex().length(24).required(),
          quantity: Joi.number().integer().min(1).required(),
        }).unknown(false),
      )
      .min(1)
      .required(),
    deliveryDayPlans: Joi.array()
      .items(
        Joi.object({
          day: Joi.number().integer().min(0).max(6).required(),
          items: Joi.array()
            .items(
              Joi.object({
                variantId: Joi.string().hex().length(24).required(),
                quantity: Joi.number().integer().min(1).required(),
              }).unknown(false),
            )
            .min(1)
            .required(),
        }).unknown(false),
      )
      .min(1)
      .optional(),
    notes: Joi.string().trim().max(1000).allow(null, "").optional(),
  })
    .unknown(false)
    .optional(),
  linkTtlMinutes: Joi.number().integer().min(15).max(10080).optional(),
}).unknown(false);

const bulkCustomerOnboardingLinksSchema = Joi.object({
  rows: Joi.array()
    .items(
      createCustomerOnboardingLinkSchema.keys({
        rowNumber: Joi.number().integer().min(2).required(),
      }),
    )
    .min(1)
    .max(250)
    .required(),
}).unknown(false);

const adjustCustomerCreditSchema = Joi.object({
  // Amount in POUNDS; positive adds credit, negative deducts. Non-zero.
  amount: Joi.number().invalid(0).required(),
  reason: Joi.string().trim().min(1).max(500).required(),
}).unknown(false);

module.exports = {
  createCustomerSchema,
  createGuestCustomerSchema,
  updateCustomerSchema,
  createCustomerOnboardingLinkSchema,
  bulkCustomerOnboardingLinksSchema,
  listCustomersQuerySchema,
  adjustCustomerCreditSchema,
};
