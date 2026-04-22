const { PERMISSIONS } = require("../../constants/Auth.constants");
const { buildSuccessResponse } = require("./access.helpers");

/**
 * Access Permission Service
 * Exposes available system permissions.
 */

const GetPermissions = async () => {
  return buildSuccessResponse({ permissions: PERMISSIONS });
};

module.exports = {
  GetPermissions,
};
