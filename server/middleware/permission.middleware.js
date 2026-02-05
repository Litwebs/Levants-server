// src/middleware/permission.middleware.js

const requireRole = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return next({
        statusCode: 401,
        message: "Authentication required",
      });
    }

    // role is already populated in auth.middleware
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

module.exports = {
  requireRole,
};
