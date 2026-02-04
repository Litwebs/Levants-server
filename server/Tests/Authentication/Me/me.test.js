const request = require("supertest");

const { createUser } = require("../../helpers/authTestData");
const app = require("../../testApp");
describe("GET /api/auth/me (E2E)", () => {
  // check that authentication is required and that it returns the user info
  test("requires authentication", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // check that it returns the authenticated user's info
  test("returns authenticated user", async () => {
    await createUser({ email: "t@example.com", password: "secret123" });

    const agent = request.agent(app);

    const loginRes = await agent.post("/api/auth/login").send({
      email: "t@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const res = await agent.get("/api/auth/me");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe("t@example.com");
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  // check that it does not authenticate with only refresh token
  test("does not authenticate with only refresh token (no access token)", async () => {
    await createUser({
      email: "me-refresh-only@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);

    const loginRes = await agent.post("/api/auth/login").send({
      email: "me-refresh-only@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    // strip accessToken, keep refreshToken
    const cookies = loginRes.headers["set-cookie"] || [];
    const refreshCookie = cookies.find((c) => c.startsWith("refreshToken="));
    expect(refreshCookie).toBeTruthy();

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", [refreshCookie]);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // check that after logout, me endpoint returns 401
  test("returns 401 after logout (cookies cleared)", async () => {
    await createUser({
      email: "me-after-logout@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);

    const loginRes = await agent.post("/api/auth/login").send({
      email: "me-after-logout@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const meBefore = await agent.get("/api/auth/me");
    expect(meBefore.status).toBe(200);

    const logoutRes = await agent.get("/api/auth/logout");
    expect(logoutRes.status).toBe(204);

    const meAfter = await agent.get("/api/auth/me");
    expect(meAfter.status).toBe(401);
    expect(meAfter.body.success).toBe(false);
  });

  // check that it returns 401 when access token is missing/cleared
  test("returns 401 when access token is missing/cleared", async () => {
    await createUser({
      email: "me-missing-access@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);

    const loginRes = await agent.post("/api/auth/login").send({
      email: "me-missing-access@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    // Replace cookies with only refreshToken (clears access)
    const cookies = loginRes.headers["set-cookie"] || [];
    const refreshCookie = cookies.find((c) => c.startsWith("refreshToken="));
    expect(refreshCookie).toBeTruthy();

    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", [refreshCookie]);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // check that sensitive fields are not returned
  test("returns safe user object (no sensitive fields)", async () => {
    await createUser({
      email: "me-safe-user@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);

    const loginRes = await agent.post("/api/auth/login").send({
      email: "me-safe-user@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);

    const user = res.body.data.user;

    expect(user.passwordHash).toBeUndefined();
    expect(user.twoFactorSecret).toBeUndefined();
    expect(user.twoFactorLogin).toBeUndefined();
    expect(user.resetPasswordToken).toBeUndefined();
  });

  // check that it does not accept a tampered access token cookie
  test("does not accept a tampered access token cookie", async () => {
    // We don't need a real user here; tampered cookie should fail auth middleware
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", ["accessToken=not-a-jwt"]);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // check that after refresh token rotation, auth remains valid
  test("auth remains valid after refresh rotation (agent stays authenticated)", async () => {
    await createUser({
      email: "me-after-refresh@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);

    const loginRes = await agent.post("/api/auth/login").send({
      email: "me-after-refresh@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const me1 = await agent.get("/api/auth/me");
    expect(me1.status).toBe(200);

    // rotate tokens
    const refreshRes = await agent.post("/api/auth/refresh").send({});
    expect(refreshRes.status).toBe(200);

    const me2 = await agent.get("/api/auth/me");
    expect(me2.status).toBe(200);
    expect(me2.body.data.user.email).toBe("me-after-refresh@example.com");
  });

  // check that it returns 403 if user is disabled after login (if your requireAuth checks user status)
  test("returns 401 if user is disabled after login (if your requireAuth checks user status)", async () => {
    // Only keep this if your requireAuth re-checks user status on each request.
    // If it doesn't, this test will fail and you should remove it.
    const User = require("../../../models/user.model");

    const user = await createUser({
      email: "me-disabled-after@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/auth/login").send({
      email: "me-disabled-after@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    // disable user after login
    await User.findByIdAndUpdate(user._id, { status: "disabled" });

    const res = await agent.get("/api/auth/me");

    // expected behavior if middleware checks status on each request:
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});
