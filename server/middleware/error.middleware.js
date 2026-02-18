// src/middleware/error.middleware.js
const { sendErr } = require("../utils/response.util");
const { mapError } = require("../utils/errorMapper.util");

function errorHandler(err, req, res, next) {
  // Handle JSON parse errors from body-parser without crashing
  if (err && err.type === "entity.parse.failed") {
    console.error("❌ JSON parse error:", err);
    const isProduction = process.env.NODE_ENV === "production";
    return sendErr(res, {
      statusCode: 400,
      message: "Invalid JSON payload",
      details: isProduction ? undefined : err.message,
    });
  }

  // Basic logging – swap for winston/pino later
  if (process.env.NODE_ENV !== "dev") {
    // eslint-disable-next-line no-console
    console.error(err.message);
  }

  const mapped = mapError(err);

  // Use simplified error shape across the API
  return sendErr(res, {
    statusCode: mapped.statusCode,
    message: mapped.message,
    details: mapped.details,
  });
}

module.exports = errorHandler;
