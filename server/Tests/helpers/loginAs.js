// Tests/helpers/loginAs.js

const request = require("supertest");
const app = require("../testApp");
const { getSetCookieHeader } = require("./cookies");

/**
 * Logs in a user and returns cookie header ready to attach to requests
 *
 * @param {Object|string} user - user document (must contain email) OR email string
 * @param {string} password - plaintext password (default matches test factory)
 */
async function loginAs(user, password = "secret123") {
  const email = typeof user === "string" ? user : user?.email;

  const res = await request(app).post("/api/auth/login").send({
    email,
    password,
  });

  if (res.status !== 200) {
    throw new Error(`loginAs failed for ${email} (status ${res.status})`);
  }

  return getSetCookieHeader(res);
}

module.exports = {
  loginAs,
};
