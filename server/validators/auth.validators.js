// src/validators/auth.validators.js
const Joi = require("joi");

const passwordRule = Joi.string().min(6).max(128).required().messages({
  "string.base": "Password must be a string",
  "string.empty": "Password is required",
  "string.min": "Password must be at least {#limit} characters long",
  "any.required": "Password is required",
});

const loginSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required().messages({
    "string.base": "Email must be a string",
    "string.email": "Please enter a valid email address",
    "string.empty": "Email is required",
    "any.required": "Email is required",
  }),
  password: passwordRule,
  rememberMe: Joi.boolean().default(false),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().trim().min(10).optional().messages({
    "string.empty": "Refresh token is required",
  }),
}).unknown(false);

const logoutSchema = Joi.object({
  refreshToken: Joi.string().trim().min(10).optional(),
}).unknown(false);

const forgotPasswordSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().required().messages({
    "string.base": "Email must be a string",
    "string.email": "Please enter a valid email address",
    "string.empty": "Email is required",
    "any.required": "Email is required",
  }),
});

const resetPasswordSchema = Joi.object({
  token: Joi.string().trim().min(10).required().messages({
    "string.empty": "Reset token is required",
    "any.required": "Reset token is required",
  }),
  newPassword: passwordRule.label("New password"),
}).unknown(false);

const changePasswordSchema = Joi.object({
  currentPassword: Joi.string().min(1).required().messages({
    "string.empty": "Current password is required",
    "any.required": "Current password is required",
  }),
  newPassword: passwordRule.label("New password"),
  confirmNewPassword: Joi.string()
    .required()
    .valid(Joi.ref("newPassword"))
    .messages({
      "any.only": "Passwords do not match",
      "any.required": "Please confirm your new password",
    }),
}).with("newPassword", "confirmNewPassword");

// ✅ Email-code 2FA (login challenge)
const enable2FASchema = Joi.object({
  method: Joi.string().valid("email").default("email"),
}).unknown(false);

// ✅ must include tempToken
const verify2FASchema = Joi.object({
  tempToken: Joi.string().trim().min(10).required().messages({
    "string.empty": "tempToken is required",
    "any.required": "tempToken is required",
  }),
  code: Joi.string().trim().min(4).max(10).required().messages({
    "string.empty": "2FA code is required",
    "any.required": "2FA code is required",
  }),
}).unknown(false);

const updateUserStatusSchema = Joi.object({
  status: Joi.string().valid("active", "disabled").required(),
}).unknown(false);

const updateUserSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional(),
  email: Joi.string().email().optional(),
  roleId: Joi.string().hex().length(24).optional(),
  status: Joi.string().valid("active", "disabled").optional(),

  preferences: Joi.object({
    notifications: Joi.object({
      newOrders: Joi.boolean().optional(),
      orderUpdates: Joi.boolean().optional(),
      lowStockAlerts: Joi.boolean().optional(),
      deliveryUpdates: Joi.boolean().optional(),
      customerMessages: Joi.boolean().optional(),
      paymentReceived: Joi.boolean().optional(),
    })
      .min(1)
      .unknown(false)
      .required(),
  })
    .min(1)
    .unknown(false)
    .optional(),

  // Password is optional but must be strong if provided
  password: Joi.string().min(8).optional(),
})
  .min(1)
  .unknown(false);

const updateSelfSchema = Joi.object({
  name: Joi.string().trim().min(2).max(100).optional(),

  email: Joi.string().email().optional(),

  preferences: Joi.object({
    theme: Joi.string().valid("light", "dark", "system").optional(),
    language: Joi.string().optional(),

    notifications: Joi.object({
      newOrders: Joi.boolean().optional(),
      orderUpdates: Joi.boolean().optional(),
      lowStockAlerts: Joi.boolean().optional(),
      deliveryUpdates: Joi.boolean().optional(),
      customerMessages: Joi.boolean().optional(),
      paymentReceived: Joi.boolean().optional(),
    })
      .min(1)
      .optional(),
  })
    .min(1)
    .optional(),
})
  .min(1)
  .unknown(false);

module.exports = {
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  enable2FASchema,
  verify2FASchema,
  updateUserStatusSchema,
  updateUserSchema,
  updateSelfSchema,
};
