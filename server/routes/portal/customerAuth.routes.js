"use strict";

const express = require("express");
const asyncHandler = require("../../utils/asyncHandler.util");
const {
  requireCustomerAuth,
} = require("../../middleware/customerAuth.middleware");
const { validateBody } = require("../../middleware/validate.middleware");
const {
  loginLimiter,
  authLimiter,
} = require("../../middleware/rateLimit.middleware");

const controller = require("../../controllers/portal/customerAuth.controller");
const {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
  changePasswordSchema,
} = require("../../validators/customerAuth.validators");

const router = express.Router();

// ===== Public routes =====
router.post(
  "/register",
  authLimiter,
  validateBody(registerSchema),
  asyncHandler(controller.Register),
);

router.post(
  "/login",
  loginLimiter,
  validateBody(loginSchema),
  asyncHandler(controller.Login),
);

router.post("/logout", asyncHandler(controller.Logout));

router.post("/refresh", asyncHandler(controller.RefreshToken));

router.post(
  "/password/forgot",
  authLimiter,
  validateBody(forgotPasswordSchema),
  asyncHandler(controller.ForgotPassword),
);

router.post(
  "/password/reset",
  authLimiter,
  validateBody(resetPasswordSchema),
  asyncHandler(controller.ResetPassword),
);

// ===== Authenticated routes =====
router.get("/me", requireCustomerAuth, asyncHandler(controller.GetMe));

router.patch(
  "/me",
  requireCustomerAuth,
  validateBody(updateProfileSchema),
  asyncHandler(controller.UpdateProfile),
);

router.patch(
  "/password",
  requireCustomerAuth,
  validateBody(changePasswordSchema),
  asyncHandler(controller.ChangePassword),
);

module.exports = router;
