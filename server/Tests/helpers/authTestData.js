const User = require("../../models/user.model");
const passwordUtil = require("../../utils/password.util");

async function createUser({
  name = "Test User",
  email = "t@example.com",
  password = "secret123",
  role = "developer",
  status = "active",
  twoFactorEnabled = false,
} = {}) {
  const passwordHash = await passwordUtil.hashPassword(password);

  const user = await User.create({
    name,
    email,
    passwordHash,
    role,
    status,
    twoFactorEnabled,
  });

  return user;
}

module.exports = {
  createUser,
};
