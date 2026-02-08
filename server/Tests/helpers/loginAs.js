// Tests/helpers/loginAs.js

const request = require("supertest");
const defaultApp = require("../testApp");
const { getSetCookieHeader } = require("./cookies");
const { createUser } = require("./authTestData");

/**
 * Logs in a user and returns cookie header ready to attach to requests
 *
 * @param {Object|string} user - user document (must contain email) OR email string
 * @param {string} password - plaintext password (default matches test factory)
 */
async function loginAs(appOrUser, userOrPassword, maybePassword) {
  const isExpressApp =
    typeof appOrUser === "function" && typeof appOrUser.use === "function";

  const app = isExpressApp ? appOrUser : defaultApp;
  const user = isExpressApp ? userOrPassword : appOrUser;
  const password =
    (isExpressApp ? maybePassword : userOrPassword) ?? "secret123";

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

async function loginAsAdmin(app) {
  const admin = await createUser({
    role: "admin",
    status: "active",
    password: "secret123",
  });
  return loginAs(app, admin);
}

async function loginAsUser(app) {
  const user = await createUser({
    role: "noaccess",
    status: "active",
    password: "secret123",
  });
  return loginAs(app, user);
}

module.exports = {
  loginAs,
  loginAsAdmin,
  loginAsUser,
};
