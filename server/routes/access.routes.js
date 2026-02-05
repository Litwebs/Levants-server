// src/routes/access.routes.js
const express = require("express");

const asyncHandler = require("../utils/asyncHandler.util");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRole } = require("../middleware/permission.middleware");
const {
  validateBody,
  validateParams,
} = require("../middleware/validate.middleware");
const { apiLimiter } = require("../middleware/rateLimit.middleware");

const accessController = require("../controllers/access.controller");
const {
  createRoleSchema,
  updateRoleSchema,
  assignRoleSchema,
} = require("../validators/access.validators");
const {
  roleIdParamSchema,
  userIdParamSchema,
} = require("../validators/common.validators");

const router = express.Router();

// 🔐 All access routes: authenticated + admin only
router.use(requireAuth);
router.use(requireRole("admin"));
router.use(apiLimiter);

/**
 * ===== ROLES =====
 */

router.get("/roles", asyncHandler(accessController.GetRoles));

router.post(
  "/roles",
  validateBody(createRoleSchema),
  asyncHandler(accessController.CreateRole),
);

router.put(
  "/roles/:roleId",
  validateParams(roleIdParamSchema),
  validateBody(updateRoleSchema),
  asyncHandler(accessController.UpdateRole),
);

router.delete(
  "/roles/:roleId",
  validateParams(roleIdParamSchema),
  asyncHandler(accessController.DeleteRole),
);

/**
 * ===== USERS =====
 */

router.put(
  "/users/:userId/role",
  validateParams(userIdParamSchema),
  validateBody(assignRoleSchema),
  asyncHandler(accessController.AssignRoleToUser),
);

/**
 * ===== PERMISSIONS =====
 */

router.get("/permissions", asyncHandler(accessController.GetPermissions));

module.exports = router;
