"use strict";

const Joi = require("joi");

const passwordSchema = Joi.string()
  .min(8)
  .max(128)
  .pattern(/[A-Z]/, "uppercase letter")
  .pattern(/[0-9]/, "digit")
  .required()
  .messages({
    "string.pattern.name": "Password must contain at least one {#name}",
    "string.min": "Password must be at least 8 characters",
  });

const registerSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(100).required(),
  lastName: Joi.string().trim().min(1).max(100).required(),
  email: Joi.string().trim().email().lowercase().required(),
  phone: Joi.string().trim().min(7).max(30).allow(null, "").optional(),
  password: passwordSchema,
  confirmPassword: Joi.string()
    .valid(Joi.ref("password"))
    .required()
    .messages({ "any.only": "Passwords do not match" }),
  inviteToken: Joi.string().trim().min(20).optional(),
}).unknown(false);

const inviteTokenParamSchema = Joi.object({
  token: Joi.string().trim().min(20).required(),
}).unknown(false);

const loginSchema = Joi.object({
  email: Joi.string().trim().email().lowercase().required(),
  password: Joi.string().required(),
  rememberMe: Joi.boolean().optional(),
}).unknown(false);

const forgotPasswordSchema = Joi.object({
  email: Joi.string().trim().email().lowercase().required(),
}).unknown(false);

const resetPasswordSchema = Joi.object({
  token: Joi.string().trim().required(),
  password: passwordSchema,
  confirmPassword: Joi.string()
    .valid(Joi.ref("password"))
    .required()
    .messages({ "any.only": "Passwords do not match" }),
}).unknown(false);

const emailVerificationConfirmSchema = Joi.object({
  email: Joi.string().trim().email().lowercase().required(),
  code: Joi.string()
    .trim()
    .pattern(/^\d{6}$/)
    .required()
    .messages({
      "string.pattern.base": "Verification code must be a 6-digit number",
    }),
}).unknown(false);

const emailVerificationResendSchema = Joi.object({
  email: Joi.string().trim().email().lowercase().required(),
}).unknown(false);

const confirmEmailChangeSchema = Joi.object({
  userId: Joi.string().trim().required(),
  token: Joi.string().trim().required(),
}).unknown(false);

const updateProfileSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(100).optional(),
  lastName: Joi.string().trim().min(1).max(100).optional(),
  email: Joi.string().trim().email().lowercase().optional(),
  phone: Joi.string().trim().min(7).max(30).allow(null, "").optional(),
  themePreference: Joi.string().valid("light", "dark").optional(),
  notificationPreferences: Joi.object({
    orderUpdates: Joi.boolean().optional(),
    subscriptionUpdates: Joi.boolean().optional(),
    deliveryUpdates: Joi.boolean().optional(),
    promotions: Joi.boolean().optional(),
  }).optional(),
}).unknown(false);

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().required(),
  newPassword: passwordSchema,
  confirmNewPassword: Joi.string()
    .valid(Joi.ref("newPassword"))
    .required()
    .messages({ "any.only": "Passwords do not match" }),
}).unknown(false);

module.exports = {
  registerSchema,
  inviteTokenParamSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  emailVerificationConfirmSchema,
  emailVerificationResendSchema,
  confirmEmailChangeSchema,
  updateProfileSchema,
  changePasswordSchema,
};
