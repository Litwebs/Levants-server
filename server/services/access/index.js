const {
  GetRoles,
  CreateRole,
  UpdateRole,
  DeleteRole,
} = require("./role.service");

const { AssignRoleToUser } = require("./user-access.service");
const { GetPermissions } = require("./permission.service");

module.exports = {
  GetRoles,
  CreateRole,
  UpdateRole,
  DeleteRole,
  AssignRoleToUser,
  GetPermissions,
};
