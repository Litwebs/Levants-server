const Joi = require("joi");

const createReviewSchema = Joi.object({
  orderId: Joi.string().trim().min(1).max(100).required(),
  customerName: Joi.string().trim().min(1).max(120).required(),
  description: Joi.string().trim().min(1).max(1000).required(),
  rating: Joi.number().integer().min(1).max(5).required(),
}).unknown(false);

const updateReviewVisibilitySchema = Joi.object({
  isVisible: Joi.boolean().required(),
}).unknown(false);

const listReviewsQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  pageSize: Joi.number().integer().min(1).max(200).optional(),
  search: Joi.string().trim().max(120).optional().allow(""),
  visibility: Joi.string().valid("all", "visible", "hidden").optional(),
  rating: Joi.string().valid("all", "1", "2", "3", "4", "5").optional(),
  sort: Joi.string()
    .valid("newest", "oldest", "rating-high", "rating-low")
    .optional(),
}).unknown(false);

const bulkIdsSchema = Joi.object({
  ids: Joi.array()
    .items(Joi.string().length(24).hex().required())
    .min(1)
    .max(200)
    .required(),
}).unknown(false);

const bulkVisibilitySchema = Joi.object({
  ids: Joi.array()
    .items(Joi.string().length(24).hex().required())
    .min(1)
    .max(200)
    .required(),
  isVisible: Joi.boolean().required(),
}).unknown(false);

module.exports = {
  createReviewSchema,
  updateReviewVisibilitySchema,
  listReviewsQuerySchema,
  bulkIdsSchema,
  bulkVisibilitySchema,
};
