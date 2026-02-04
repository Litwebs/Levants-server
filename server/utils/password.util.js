// src/utils/password.util.js
//
// Wrapper around bcrypt for hashing + verifying passwords.

const bcrypt = require("bcryptjs");

// You can tweak these via env if needed.
const SALT_ROUNDS = Number(process.env.PASSWORD_SALT_ROUNDS || 12);

/**
 * Hash a plain-text password.
 *
 * @param {string} password
 * @returns {Promise<string>} bcrypt hash
 */
async function hashPassword(password) {
  if (typeof password !== "string" || password.length < 6) {
    const err = new Error("Password must be at least 6 characters");
    err.statusCode = 400;
    err.code = "PASSWORD_TOO_SHORT";
    throw err;
  }

  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  const hash = await bcrypt.hash(password, salt);
  return hash;
}

/**
 * Verify a plain-text password against a bcrypt hash.
 *
 * @param {string} password
 * @param {string} hash
 * @returns {Promise<boolean>}
 */
async function verifyPassword(password, hash) {
  if (!hash) return false;
  if (typeof password !== "string" || !password) return false;

  return bcrypt.compare(password, hash);
}

module.exports = {
  hashPassword,
  verifyPassword,
};
