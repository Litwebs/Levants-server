// src/services/access.service.js

const Role = require("../models/role.model");
const User = require("../models/user.model");
const { PERMISSIONS } = require("../constants/Auth.constants");

/**
 * ===== ROLES =====
 */

const GetRoles = async () => {
  const roles = await Role.find().sort({ createdAt: 1 });
  return { success: true, data: { roles } };
};

const CreateRole = async ({ name, description, permissions, createdBy }) => {
  const existing = await Role.findOne({ name });
  if (existing) {
    return { success: false, message: "Role already exists" };
  }

  const role = await Role.create({
    name,
    description,
    permissions,
    isSystem: false,
    createdBy,
  });

  return { success: true, data: { role } };
};

const UpdateRole = async ({ roleId, description, permissions }) => {
  const role = await Role.findById(roleId);
  if (!role) {
    return { success: false, message: "Role not found" };
  }

  if (role.isSystem) {
    return {
      success: false,
      message: "System roles cannot be modified",
    };
  }

  if (description !== undefined) role.description = description;
  if (permissions !== undefined) role.permissions = permissions;

  await role.save();

  return { success: true, data: { role } };
};

const DeleteRole = async ({ roleId }) => {
  const role = await Role.findById(roleId);
  if (!role) {
    return { success: false, message: "Role not found" };
  }

  if (role.isSystem) {
    return {
      success: false,
      message: "System roles cannot be deleted",
    };
  }

  const usersWithRole = await User.countDocuments({ role: roleId });
  if (usersWithRole > 0) {
    return {
      success: false,
      message: "Role is assigned to users",
    };
  }

  await role.deleteOne();
  return { success: true };
};

/**
 * ===== USERS =====
 */

const AssignRoleToUser = async ({ userId, roleId }) => {
  const role = await Role.findById(roleId);
  if (!role) {
    return { success: false, message: "Role not found" };
  }

  const user = await User.findById(userId);
  if (!user) {
    return { success: false, message: "User not found" };
  }

  user.role = role._id;
  await user.save();

  return { success: true };
};

/**
 * ===== PERMISSIONS =====
 */

const GetPermissions = async () => {
  return { success: true, data: { permissions: PERMISSIONS } };
};

module.exports = {
  GetRoles,
  CreateRole,
  UpdateRole,
  DeleteRole,
  AssignRoleToUser,
  GetPermissions,
};
