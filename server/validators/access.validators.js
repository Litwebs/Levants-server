// src/validators/access.validators.js

const Joi = require("joi");
const { PERMISSIONS } = require("../constants/auth.constants");

/**
 * Allow:
 *  - "*"
 *  - "orders.*"
 *  - exact permissions from registry
 */
const permissionSchema = Joi.string()
  .trim()
  .custom((value, helpers) => {
    if (value === "*") return value;

    // wildcard resource: orders.*
    if (/^[a-z]+\.[a-z.]+\.\*$/.test(value)) return value;
    if (/^[a-z]+\.\*$/.test(value)) return value;

    // exact permission
    if (PERMISSIONS.includes(value)) return value;

    return helpers.error("any.invalid");
  }, "permission validation");

/**
 * ===== ROLES =====
 */

const createRoleSchema = Joi.object({
  name: Joi.string()
    .lowercase()
    .trim()
    .min(2)
    .max(50)
    .pattern(/^[a-z0-9_-]+$/)
    .required(),

  description: Joi.string().trim().max(255).allow("").optional(),

  permissions: Joi.array().items(permissionSchema).min(1).required(),
});

const updateRoleSchema = Joi.object({
  description: Joi.string().trim().max(255).allow("").optional(),

  permissions: Joi.array().items(permissionSchema).min(1).optional(),
}).min(1); // at least one field must be updated

/**
 * ===== USERS =====
 */

const assignRoleSchema = Joi.object({
  roleId: Joi.string().hex().length(24).required(),
});

module.exports = {
  createRoleSchema,
  updateRoleSchema,
  assignRoleSchema,
};
