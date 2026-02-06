// src/controllers/access.controller.js

const accessService = require("../services/access.service");
const { sendOk, sendErr } = require("../utils/response.util");

/**
 * ===== ROLES =====
 */

const GetRoles = async (req, res) => {
  const result = await accessService.GetRoles();
  return sendOk(res, result.data);
};

const CreateRole = async (req, res) => {
  const { name, description, permissions } = req.body || {};

  if (!name || !Array.isArray(permissions)) {
    return sendErr(res, {
      statusCode: 400,
      message: "name and permissions are required",
    });
  }

  const result = await accessService.CreateRole({
    name,
    description,
    permissions,
    createdBy: req.user._id,
  });

  if (!result.success) {
    const statusCode = result.message === "Role already exists" ? 409 : 400;
    return sendErr(res, { statusCode, message: result.message });
  }

  return sendOk(res, result.data);
};

const UpdateRole = async (req, res) => {
  const { roleId } = req.params;

  const result = await accessService.UpdateRole({
    roleId,
    ...req.body,
  });

  if (!result.success) {
    const statusCode = result.message === "Role not found" ? 404 : 400;
    return sendErr(res, { statusCode, message: result.message });
  }

  return sendOk(res, result.data);
};

const DeleteRole = async (req, res) => {
  const { roleId } = req.params;

  const result = await accessService.DeleteRole({ roleId });

  if (!result.success) {
    const statusCode = result.message === "Role not found" ? 404 : 400;
    return sendErr(res, { statusCode, message: result.message });
  }

  return sendOk(res);
};

/**
 * ===== USERS =====
 */

const AssignRoleToUser = async (req, res) => {
  const { userId } = req.params;
  const { roleId } = req.body || {};

  if (!roleId) {
    return sendErr(res, {
      statusCode: 400,
      message: "roleId is required",
    });
  }

  const result = await accessService.AssignRoleToUser({ userId, roleId });

  if (!result.success) {
    const statusCode =
      result.message === "User not found" || result.message === "Role not found"
        ? 404
        : 400;
    return sendErr(res, { statusCode, message: result.message });
  }

  return sendOk(res, { assigned: true });
};
/**
 * ===== PERMISSIONS =====
 */

const GetPermissions = async (req, res) => {
  const result = await accessService.GetPermissions();
  return sendOk(res, result.data);
};

module.exports = {
  GetRoles,
  CreateRole,
  UpdateRole,
  DeleteRole,
  AssignRoleToUser,
  GetPermissions,
};
