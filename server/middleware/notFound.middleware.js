// src/middleware/notFound.middleware.js
//
// Catch-all 404 handler – register AFTER all routes, BEFORE error middleware.

const { sendErr } = require("../utils/response.util");

function notFoundMiddleware(req, res, next) {
  return sendErr(res, {
    statusCode: 404,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

module.exports = notFoundMiddleware;
