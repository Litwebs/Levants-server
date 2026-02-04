const Joi = require("joi");
const { sendError, sendErr } = require("../utils/response.util");

function buildValidationError(error) {
  if (!error || !error.details) return null;

  return error.details.map((d) => ({
    message: d.message,
    path: d.path, // array of keys
    type: d.type, // e.g. "string.email"
    context: d.context, // Joi context (limit, label, value, etc.)
  }));
}

function createValidator(location) {
  return (schema, options = {}) => {
    if (!schema || !Joi.isSchema(schema)) {
      // Developer misconfiguration – respond with 500 in a consistent shape
      return (req, res) =>
        sendErr(res, {
          statusCode: 500,
          message: `Validation middleware: expected a Joi schema for ${location}`,
        });
    }

    const {
      // Strip unknown keys by default to keep payloads clean
      stripUnknown = true,
      // Do not abort early so you get all validation errors
      abortEarly = false,
      // Allow overriding Joi options if needed
      joiOptions = {},
    } = options;

    return (req, res, next) => {
      const value = req[location];

      const { error, value: validated } = schema.validate(value, {
        abortEarly,
        stripUnknown,
        ...joiOptions,
      });

      if (error) {
        const details = buildValidationError(error);
        const specificMessage =
          details && details.length > 0
            ? details[0].message
            : "Validation failed";
        return sendErr(res, {
          statusCode: 400,
          message: specificMessage,
          details,
        });
      }

      // Replace original payload with validated / sanitized one
      req[location] = validated;
      return next();
    };
  };
}

const validateBody = createValidator("body");
const validateQuery = createValidator("query");
const validateParams = createValidator("params");

module.exports = {
  validateBody,
  validateQuery,
  validateParams,
};
