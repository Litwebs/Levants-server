const isDriverRole = (roleName) => String(roleName || "") === "driver";

const buildSuccessResponse = (data = {}) => ({
  success: true,
  ...(Object.keys(data).length > 0 ? { data } : {}),
});

const buildErrorResponse = (message) => ({
  success: false,
  message,
});

module.exports = {
  isDriverRole,
  buildSuccessResponse,
  buildErrorResponse,
};
