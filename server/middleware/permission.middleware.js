// src/middleware/permission.middleware.js

const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      // requireAuth should have handled this
      return next({
        statusCode: 500,
        message: "Role check failed: user context missing",
      });
    }

    const roleName = req.user.role.name;

    if (roleName !== requiredRole) {
      return next({
        statusCode: 403,
        message: "Insufficient permissions",
      });
    }

    return next();
  };
};

const requirePermission = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      // This is NOT an auth error – it's a wiring error
      return next({
        statusCode: 500,
        message: "Permission check failed: user context missing",
      });
    }

    const permissions = req.user.role.permissions;

    if (!Array.isArray(permissions)) {
      return next({
        statusCode: 403,
        message: "Insufficient permissions",
      });
    }

    // ✅ Admin wildcard
    if (permissions.includes("*")) {
      return next();
    }

    // ✅ Exact permission match
    if (permissions.includes(requiredPermission)) {
      return next();
    }

    // ✅ Wildcard namespace match (e.g. "orders.*" matches "orders.read")
    for (const perm of permissions) {
      if (typeof perm !== "string") continue;
      if (!perm.endsWith(".*")) continue;

      const prefix = perm.slice(0, -1); // keep trailing dot
      if (requiredPermission.startsWith(prefix)) {
        return next();
      }
    }

    // ❌ Permission denied
    return next({
      statusCode: 403,
      message: "Insufficient permissions",
    });
  };
};

module.exports = {
  requireRole,
  requirePermission,
};
