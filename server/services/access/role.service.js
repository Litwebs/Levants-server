const Role = require("../../models/role.model");
const User = require("../../models/user.model");
const {
  buildSuccessResponse,
  buildErrorResponse,
} = require("./access.helpers");

/**
 * Access Role Service
 * Handles CRUD operations for roles.
 */

const GetRoles = async () => {
  const roles = await Role.find().sort({ createdAt: 1 });
  return buildSuccessResponse({ roles });
};

const CreateRole = async ({ name, description, permissions, createdBy }) => {
  const existingRole = await Role.findOne({ name });

  if (existingRole) {
    return buildErrorResponse("Role already exists");
  }

  const role = await Role.create({
    name,
    description,
    permissions,
    isSystem: false,
    createdBy,
  });

  return buildSuccessResponse({ role });
};

const UpdateRole = async ({ roleId, description, permissions }) => {
  const role = await Role.findById(roleId);

  if (!role) {
    return buildErrorResponse("Role not found");
  }

  if (role.isSystem) {
    return buildErrorResponse("System roles cannot be modified");
  }

  if (description !== undefined) {
    role.description = description;
  }

  if (permissions !== undefined) {
    role.permissions = permissions;
  }

  await role.save();

  return buildSuccessResponse({ role });
};

const DeleteRole = async ({ roleId }) => {
  const role = await Role.findById(roleId);

  if (!role) {
    return buildErrorResponse("Role not found");
  }

  if (role.isSystem) {
    return buildErrorResponse("System roles cannot be deleted");
  }

  const usersWithRole = await User.countDocuments({ role: roleId });

  if (usersWithRole > 0) {
    return buildErrorResponse("Role is assigned to users");
  }

  await role.deleteOne();

  return buildSuccessResponse();
};

module.exports = {
  GetRoles,
  CreateRole,
  UpdateRole,
  DeleteRole,
};
