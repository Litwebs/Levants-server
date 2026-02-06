function mapError(err) {
  // ✅ RESPECT explicit errors FIRST
  if (err && err.statusCode && err.message) {
    return {
      statusCode: err.statusCode,
      code: err.code || null,
      message: err.message,
      details: err.details || null,
    };
  }

  // Defaults
  let statusCode = err.statusCode || err.status || 500;
  let code = err.code || "INTERNAL_SERVER_ERROR";
  let message = err.message || "Internal server error";
  let details = null;

  // Joi validation
  if (err.isJoi) {
    statusCode = 400;
    code = "VALIDATION_ERROR";
    message = "Request validation failed";
    details = err.details?.map((d) => d.message) || null;
  }

  // JWT errors
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    code = "UNAUTHENTICATED";
    message = "Invalid access token";
  }

  if (err.name === "TokenExpiredError") {
    statusCode = 401;
    code = "TOKEN_EXPIRED";
    message = "Access token has expired";
  }

  // Mongoose validation
  if (err.name === "ValidationError") {
    statusCode = 400;
    code = "MONGOOSE_VALIDATION_ERROR";
    message = "Validation failed";
    details = Object.values(err.errors || {}).map((e) => e.message);
  }

  // Mongo duplicate key
  if (err.code === 11000) {
    statusCode = 409;
    code = "DUPLICATE_KEY_ERROR";
    message = "Duplicate value for a unique field";
    details = { keyValue: err.keyValue };
  }

  // Auth fallbacks (ONLY if message is missing)
  if (err.code === "UNAUTHORIZED" && !err.message) {
    statusCode = 401;
    message = "Unauthorized";
  }

  if (err.code === "FORBIDDEN" && !err.message) {
    statusCode = 403;
    message = "Forbidden";
  }

  // Production hardening
  if (process.env.NODE_ENV === "production" && statusCode >= 500) {
    message = "Internal server error";
  }

  return { statusCode, code, message, details };
}

module.exports = { mapError };
