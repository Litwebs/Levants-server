// src/validators/common.validators.js
const Joi = require("joi");

const objectId = Joi.string().hex().length(24);

const roleIdParamSchema = Joi.object({
  roleId: objectId.required(),
});

const userIdParamSchema = Joi.object({
  userId: objectId.required(),
});

module.exports = {
  roleIdParamSchema,
  userIdParamSchema,
};
