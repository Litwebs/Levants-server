const Role = require("../../models/role.model");
const User = require("../../models/user.model");
const { DRIVER_NOTIFICATION_DEFAULTS } = require("./access.constants");
const {
  isDriverRole,
  buildSuccessResponse,
  buildErrorResponse,
} = require("./access.helpers");

/**
 * Access User Service
 * Handles user-role assignment and user access-related updates.
 */

const AssignRoleToUser = async ({ userId, roleId }) => {
  const role = await Role.findById(roleId);

  if (!role) {
    return buildErrorResponse("Role not found");
  }

  const user = await User.findById(userId);

  if (!user) {
    return buildErrorResponse("User not found");
  }

  user.role = role._id;

  if (isDriverRole(role.name)) {
    user.set("preferences.notifications", {
      ...DRIVER_NOTIFICATION_DEFAULTS,
    });
  }

  await user.save();

  return buildSuccessResponse();
};

module.exports = {
  AssignRoleToUser,
};
