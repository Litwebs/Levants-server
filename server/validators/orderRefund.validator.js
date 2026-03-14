const Joi = require("joi");

const refundOrderSchema = Joi.object({
  // Amount in major currency units (e.g., 6.98 GBP). If omitted, refund the remaining balance.
  amount: Joi.number().positive().precision(2).optional(),

  reason: Joi.string().trim().max(500).optional(),

  restock: Joi.boolean().optional().default(false),
}).unknown(false);

module.exports = {
  refundOrderSchema,
};
