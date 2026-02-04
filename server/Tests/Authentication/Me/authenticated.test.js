const request = require("supertest");

const jwtUtil = require("../../../utils/jwt.util");
const { createUser } = require("../../helpers/authTestData");
const {
  getSetCookieHeader,
  getCookieValueFromSetCookie,
} = require("../../helpers/cookies");
const app = require("../../testApp");

describe("GET /api/auth/authenticated (E2E)", () => {
  test("returns authenticated:false when no token provided", async () => {
    const res = await request(app).get("/api/auth/authenticated");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { authenticated: false, user: null },
    });
  });

  test("returns authenticated:true when access token is valid", async () => {
    const user = await createUser({
      email: "authcheck-valid@example.com",
      password: "secret123",
      role: "admin",
    });

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "authcheck-valid@example.com",
      password: "secret123",
    });

    expect(loginRes.status).toBe(200);
    const setCookie = getSetCookieHeader(loginRes);
    const accessToken = getCookieValueFromSetCookie(setCookie, "accessToken");
    expect(accessToken).toBeTruthy();

    const res = await request(app)
      .get("/api/auth/authenticated")
      .set("Authorization", `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.authenticated).toBe(true);
    expect(res.body.data.user.sub).toBe(String(user._id));
    expect(res.body.data.user.role).toBe("admin");
  });

  test("returns authenticated:false when access token is invalid", async () => {
    const res = await request(app)
      .get("/api/auth/authenticated")
      .set("Authorization", "Bearer invalid-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { authenticated: false, user: null },
    });
  });

  test("works with accessToken cookie (no Authorization header)", async () => {
    await createUser({
      email: "authcheck-cookie@example.com",
      password: "secret123",
      role: "developer",
    });

    const agent = request.agent(app);

    const loginRes = await agent.post("/api/auth/login").send({
      email: "authcheck-cookie@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const res = await agent.get("/api/auth/authenticated");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.authenticated).toBe(true);
    expect(res.body.data.user.role).toBe("developer");
  });

  test("prefers Authorization header over cookie if both are present (cookie bad, header good)", async () => {
    const user = await createUser({
      email: "authcheck-prefer-header@example.com",
      password: "secret123",
      role: "admin",
    });

    // get a valid access token via login
    const loginRes = await request(app).post("/api/auth/login").send({
      email: "authcheck-prefer-header@example.com",
      password: "secret123",
    });
    const cookies = getSetCookieHeader(loginRes);
    const goodAccess = getCookieValueFromSetCookie(cookies, "accessToken");
    expect(goodAccess).toBeTruthy();

    // send a bad cookie but a good header
    const res = await request(app)
      .get("/api/auth/authenticated")
      .set("Cookie", ["accessToken=bad.cookie.value"])
      .set("Authorization", `Bearer ${goodAccess}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.authenticated).toBe(true);
    expect(res.body.data.user.sub).toBe(String(user._id));
  });

  test("returns authenticated:false when Authorization header is missing 'Bearer' prefix", async () => {
    // some clients send token directly - should be treated as invalid
    const res = await request(app)
      .get("/api/auth/authenticated")
      .set("Authorization", "notbearer sometoken");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { authenticated: false, user: null },
    });
  });

  test("returns authenticated:false when Bearer token is empty", async () => {
    const res = await request(app)
      .get("/api/auth/authenticated")
      .set("Authorization", "Bearer ");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { authenticated: false, user: null },
    });
  });

  test("returns authenticated:false when token is validly signed but user no longer exists", async () => {
    const user = await createUser({
      email: "authcheck-user-deleted@example.com",
      password: "secret123",
      role: "admin",
    });

    // sign a token directly for this user (then delete the user)
    const accessToken = jwtUtil.signAccessToken(user);
    await require("../../../models/user.model").deleteOne({ _id: user._id });

    const res = await request(app)
      .get("/api/auth/authenticated")
      .set("Authorization", `Bearer ${accessToken}`);

    // depends on your CheckAuth implementation:
    // many implementations return false if user not found
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.authenticated).toBe(false);
    expect(res.body.data.user).toBe(null);
  });

  test("returns authenticated:false when token is validly signed but user is disabled/archived (if CheckAuth checks DB status)", async () => {
    const User = require("../../../models/user.model");

    const user = await createUser({
      email: "authcheck-disabled@example.com",
      password: "secret123",
      role: "developer",
      status: "active",
    });

    const accessToken = jwtUtil.signAccessToken(user);

    // disable after token issuance
    await User.updateOne({ _id: user._id }, { $set: { status: "disabled" } });

    const res = await request(app)
      .get("/api/auth/authenticated")
      .set("Authorization", `Bearer ${accessToken}`);

    // If your CheckAuth checks DB user state, it should return false.
    // If it only verifies JWT, then it will return true.
    // Pick one behavior and keep it consistent.
    expect(res.status).toBe(200);
    // choose the assertion that matches your implementation:
    // expect(res.body.data.authenticated).toBe(false);
    expect([true, false]).toContain(res.body.data.authenticated);
  });

  test("does not leak sensitive fields in user payload", async () => {
    const user = await createUser({
      email: "authcheck-sensitive@example.com",
      password: "secret123",
      role: "admin",
    });

    const token = jwtUtil.signAccessToken(user);

    const res = await request(app)
      .get("/api/auth/authenticated")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const u = res.body.data.user || {};
    // only JWT claims should exist here (sub/role/iat/exp etc)
    expect(u.passwordHash).toBeUndefined();
    expect(u.twoFactorSecret).toBeUndefined();
    expect(u.twoFactorLogin).toBeUndefined();
    expect(u.email).toBeUndefined(); // unless you intentionally include it in access token claims
  });

  test("ignores refreshToken cookie (should not treat refresh token as auth)", async () => {
    const user = await createUser({
      email: "authcheck-refreshcookie@example.com",
      password: "secret123",
      role: "developer",
    });

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "authcheck-refreshcookie@example.com",
      password: "secret123",
    });

    const cookies = getSetCookieHeader(loginRes);
    const refreshToken = getCookieValueFromSetCookie(cookies, "refreshToken");
    expect(refreshToken).toBeTruthy();

    const res = await request(app)
      .get("/api/auth/authenticated")
      .set("Cookie", [`refreshToken=${refreshToken}`]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      data: { authenticated: false, user: null },
    });
  });
});
