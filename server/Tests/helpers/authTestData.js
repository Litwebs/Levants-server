// tests/helpers/createUser.js

const User = require("../../models/user.model");
const Role = require("../../models/role.model");
const passwordUtil = require("../../utils/password.util");

/**
 * Resolve a role by name.
 * If it doesn't exist (test DB), create a minimal one.
 */
async function resolveRole(roleName) {
  let role = await Role.findOne({ name: roleName });

  if (!role) {
    role = await Role.create({
      name: roleName,
      permissions: roleName === "admin" ? ["*"] : [],
      isSystem: false,
    });
  }

  return role;
}

async function createUser({
  name = "Test User",
  email = "t@example.com",
  password = "secret123",
  role = "staff", // 👈 role NAME, not id
  status = "active",
  twoFactorEnabled = false,
} = {}) {
  const passwordHash = await passwordUtil.hashPassword(password);

  const roleDoc = await resolveRole(role);

  const user = await User.create({
    name,
    email,
    passwordHash,
    role: roleDoc._id, // ✅ ObjectId
    status,
    twoFactorEnabled,
  });

  return user;
}

module.exports = {
  createUser,
};
