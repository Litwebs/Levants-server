// src/middleware/permission.middleware.js

/**
 * Check if a permission matches (supports wildcards)
 */
function permissionMatches(granted, required) {
  if (granted === "*") return true;
  if (granted === required) return true;

  // orders.* -> orders.create
  if (granted.endsWith(".*")) {
    const prefix = granted.slice(0, -2);
    return required.startsWith(prefix + ".");
  }

  return false;
}

/**
 * Core checker
 */
function hasPermission(rolePermissions = [], required) {
  return rolePermissions.some((p) => permissionMatches(p, required));
}

/**
 * ===== requirePermission =====
 *
 * Usage:
 *   requirePermission("orders.create")
 *   requirePermission(["orders.update", "orders.delete"]) // OR
 *   requirePermission({ all: ["orders.read", "customers.read"] }) // AND
 */
function requirePermission(requirement) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const permissions = req.user.role.permissions || [];

    let allowed = false;

    // Single permission
    if (typeof requirement === "string") {
      allowed = hasPermission(permissions, requirement);
    }

    // OR condition
    else if (Array.isArray(requirement)) {
      allowed = requirement.some((r) => hasPermission(permissions, r));
    }

    // AND condition
    else if (requirement?.all && Array.isArray(requirement.all)) {
      allowed = requirement.all.every((r) => hasPermission(permissions, r));
    }

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions",
      });
    }

    next();
  };
}

/**
 * ===== requireRole =====
 *
 * Usage:
 *   requireRole("admin")
 *   requireRole(["admin", "manager"])
 */
function requireRole(requiredRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated",
      });
    }

    const userRole = req.user.role.name;

    const allowed = Array.isArray(requiredRoles)
      ? requiredRoles.includes(userRole)
      : userRole === requiredRoles;

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "Forbidden",
      });
    }

    next();
  };
}

module.exports = {
  requirePermission,
  requireRole,
};
