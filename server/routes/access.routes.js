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

/**
 * ============================================================
 * 🔐 GLOBAL ACCESS GUARDS
 * ============================================================
 * Order matters:
 *   1. requireAuth    → ensures req.user exists (401)
 *   2. requireRole    → enforces admin-only access (403)
 * ============================================================
 */
router.use(requireAuth);
router.use(requireRole("admin"));

/**
 * ============================================================
 * ROLES
 * ============================================================
 */

router.get("/roles", apiLimiter, asyncHandler(accessController.GetRoles));

router.post(
  "/roles",
  apiLimiter,
  validateBody(createRoleSchema),
  asyncHandler(accessController.CreateRole),
);

router.put(
  "/roles/:roleId",
  apiLimiter,
  validateParams(roleIdParamSchema),
  validateBody(updateRoleSchema),
  asyncHandler(accessController.UpdateRole),
);

router.delete(
  "/roles/:roleId",
  apiLimiter,
  validateParams(roleIdParamSchema),
  asyncHandler(accessController.DeleteRole),
);

/**
 * ============================================================
 * USERS
 * ============================================================
 */

router.put(
  "/users/:userId/role",
  apiLimiter,
  validateParams(userIdParamSchema),
  validateBody(assignRoleSchema),
  asyncHandler(accessController.AssignRoleToUser),
);

/**
 * ============================================================
 * PERMISSIONS
 * ============================================================
 */

router.get(
  "/permissions",
  apiLimiter,
  asyncHandler(accessController.GetPermissions),
);

module.exports = router;
