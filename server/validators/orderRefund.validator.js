const Joi = require("joi");

const refundOrderSchema = Joi.object({
  reason: Joi.string().trim().max(500).optional(),

  restock: Joi.boolean().optional().default(false),
}).unknown(false);

module.exports = {
  refundOrderSchema,
};
