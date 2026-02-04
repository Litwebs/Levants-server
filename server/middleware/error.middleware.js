// src/middleware/error.middleware.js
const { sendErr } = require("../utils/response.util");
const { mapError } = require("../utils/errorMapper.util");

function errorHandler(err, req, res, next) {
  // Handle JSON parse errors from body-parser without crashing
  if (err && err.type === "entity.parse.failed") {
    return sendErr(res, {
      statusCode: 400,
      message: "Invalid JSON payload",
    });
  }

  // Basic logging – swap for winston/pino later
  if (process.env.NODE_ENV !== "test") {
    // eslint-disable-next-line no-console
    console.error(err);
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
