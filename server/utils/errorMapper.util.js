function mapError(err) {
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

  // JSON Web Token errors
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

  // Mongoose validation errors
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

  // Common auth codes
  if (err.code === "UNAUTHORIZED") {
    statusCode = 401;
    message = err.message || "Unauthorized";
  }

  if (err.code === "FORBIDDEN") {
    statusCode = 403;
    message = err.message || "Forbidden";
  }

  // Production: avoid leaking internals for 500s
  if (process.env.NODE_ENV === "production" && statusCode >= 500) {
    message = "Internal server error";
  }

  return { statusCode, code, message, details };
}

module.exports = { mapError };
