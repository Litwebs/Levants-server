// src/routes/auth.routes.js
const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const {
  validateBody,
  validateParams,
} = require("../middleware/validate.middleware");
const { requireAuth } = require("../middleware/auth.middleware");
const { requirePermission } = require("../middleware/permission.middleware");
const authController = require("../controllers/auth.controller");
const {
  loginLimiter,
  apiLimiter,
} = require("../middleware/rateLimit.middleware");
const { userIdParamSchema } = require("../validators/common.validators");

const {
  loginSchema,
  refreshSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  enable2FASchema,
  verify2FASchema,
  updateUserStatusSchema,
  updateUserSchema,
  updateSelfSchema,
} = require("../validators/auth.validators");

const router = express.Router();

// USED TO CHECK IF AUTHENTICATED
router.get(
  "/authenticated",
  apiLimiter,
  asyncHandler(authController.CheckAuth),
);

// USED TO GET ACTIVE SESSIONS
router.get(
  "/sessions",
  apiLimiter,
  requireAuth,
  asyncHandler(authController.GetSessions),
);

// USED TO GET CURRENT USER INFO
router.get(
  "/me",
  apiLimiter,
  requireAuth,
  asyncHandler(authController.GetAuthenticatedUser),
);

// USED TO TO LOGIN
router.post(
  "/login",
  loginLimiter,
  validateBody(loginSchema),
  asyncHandler(authController.Login),
);

// USED TO REFRESH TOKEN
router.post(
  "/refresh",
  apiLimiter,
  validateBody(refreshSchema),
  asyncHandler(authController.RefreshToken),
);

// USED TO LOGOUT
router.get("/logout", asyncHandler(authController.Logout));

// USED TO REQUEST PASSWORD CHANGE SEND EMAIL
router.post(
  "/forgot-password",
  apiLimiter,
  validateBody(forgotPasswordSchema),
  asyncHandler(authController.ForgotPassword),
);

// USED TO VERIFY RESET PASSWORD TOKEN
router.get(
  "/reset-password/verify",
  apiLimiter,
  asyncHandler(authController.VerifyResetPasswordToken),
);

// USED TO RESET PASSWORD
router.post(
  "/reset-password",
  apiLimiter,
  validateBody(resetPasswordSchema),
  asyncHandler(authController.ResetPassword),
);

// USED TO CHANGE PASSWORD IN APP (Authenticated)
router.post(
  "/change-password",
  apiLimiter,
  requireAuth,
  validateBody(changePasswordSchema),
  asyncHandler(authController.ChangePassword),
);

// USED TO TOGGLE 2 FACTOR AUTHENTICATION (Authenticated)
router.get(
  "/2fa/toggle",
  apiLimiter,
  requireAuth,
  validateBody(enable2FASchema),
  asyncHandler(authController.Toggle2FA),
);

// ✅ IMPORTANT: no requireAuth here
router.post(
  "/2fa/verify",
  apiLimiter,
  validateBody(verify2FASchema),
  asyncHandler(authController.Verify2FA),
);

// USED TO REVOKE A SESSION
router.post(
  "/sessions/:sessionId/revoke",
  apiLimiter,
  requireAuth,
  asyncHandler(authController.RevokeSession),
);

// USED TO REVOKE ALL SESSIONS
router.put(
  "/users/:userId/status",
  apiLimiter,
  requireAuth,
  requirePermission("users.status.update"),
  validateParams(userIdParamSchema),
  validateBody(updateUserStatusSchema),
  asyncHandler(authController.UpdateUserStatus),
);

// USED TO GET USER BY ID (Admin or self)
router.get(
  "/users/:userId",
  apiLimiter,
  requireAuth,
  requirePermission("users.read"),
  validateParams(userIdParamSchema),
  asyncHandler(authController.GetUserById),
);

// USED TO UPDATE USER (Admin or self)
router.put(
  "/users/:userId",
  apiLimiter,
  requireAuth,
  requirePermission("users.update"),
  validateParams(userIdParamSchema),
  validateBody(updateUserSchema),
  asyncHandler(authController.UpdateUser),
);

// USED TO GET ALL USERS (Admin only)
router.get(
  "/users",
  apiLimiter,
  requireAuth,
  requirePermission("users.read"),
  asyncHandler(authController.ListUsers),
);

// USED TO UPDATE SELF INFO (Authenticated users)
router.put(
  "/me",
  apiLimiter,
  requireAuth,
  validateBody(updateSelfSchema),
  asyncHandler(authController.UpdateSelf),
);

module.exports = router;
