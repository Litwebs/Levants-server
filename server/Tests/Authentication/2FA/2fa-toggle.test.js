const request = require("supertest");

const User = require("../../../models/user.model");
const { createUser } = require("../../helpers/authTestData");
const app = require("../../testApp");

describe("GET /api/auth/2fa/toggle (E2E)", () => {
  async function loginAgent({ email, password }) {
    const agent = request.agent(app);

    const res = await agent.post("/api/auth/login").send({
      email,
      password,
      rememberMe: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    return agent;
  }

  test("requires authentication", async () => {
    const res = await request(app).get("/api/auth/2fa/toggle");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("toggles 2FA on and off when authenticated", async () => {
    const user = await createUser({
      email: "toggle2fa@example.com",
      password: "secret123",
      twoFactorEnabled: false,
    });

    const agent = await loginAgent({
      email: "toggle2fa@example.com",
      password: "secret123",
    });

    const first = await agent.get("/api/auth/2fa/toggle");
    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);
    expect(first.body.data).toEqual({ enabled: true });

    const fresh1 = await User.findById(user._id);
    expect(fresh1.twoFactorEnabled).toBe(true);

    const second = await agent.get("/api/auth/2fa/toggle");
    expect(second.status).toBe(200);
    expect(second.body.success).toBe(true);
    expect(second.body.data).toEqual({ enabled: false });

    const fresh2 = await User.findById(user._id);
    expect(fresh2.twoFactorEnabled).toBe(false);
  });

  test("returns 403 if user is disabled after login (if requireAuth checks user status)", async () => {
    const user = await createUser({
      email: "toggle2fa-disabled@example.com",
      password: "secret123",
      twoFactorEnabled: false,
      status: "active",
    });

    const agent = await loginAgent({
      email: "toggle2fa-disabled@example.com",
      password: "secret123",
    });

    await User.findByIdAndUpdate(user._id, { status: "disabled" });

    const res = await agent.get("/api/auth/2fa/toggle");

    // in your app you previously got 403 for disabled user on /me
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  test("returns 401 if user is deleted after login (token subject no longer exists)", async () => {
    const user = await createUser({
      email: "toggle2fa-deleted@example.com",
      password: "secret123",
      twoFactorEnabled: false,
    });

    const agent = await loginAgent({
      email: "toggle2fa-deleted@example.com",
      password: "secret123",
    });

    await User.deleteOne({ _id: user._id });

    const res = await agent.get("/api/auth/2fa/toggle");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("response always includes boolean enabled and never leaks sensitive fields", async () => {
    await createUser({
      email: "toggle2fa-shape@example.com",
      password: "secret123",
      twoFactorEnabled: false,
    });

    const agent = await loginAgent({
      email: "toggle2fa-shape@example.com",
      password: "secret123",
    });

    const res = await agent.get("/api/auth/2fa/toggle");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // shape
    expect(typeof res.body.data.enabled).toBe("boolean");

    // no user object should be returned (and no secrets)
    expect(res.body.data.user).toBeUndefined();
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.body.twoFactorSecret).toBeUndefined();
  });

  test("does not set auth cookies (toggle should not rotate tokens)", async () => {
    await createUser({
      email: "toggle2fa-cookies@example.com",
      password: "secret123",
      twoFactorEnabled: false,
    });

    const agent = await loginAgent({
      email: "toggle2fa-cookies@example.com",
      password: "secret123",
    });

    const res = await agent.get("/api/auth/2fa/toggle");

    expect(res.status).toBe(200);

    const setCookie = res.headers["set-cookie"] || [];
    // should not mint/rotate tokens when toggling a preference
    expect(setCookie.join("\n")).not.toContain("accessToken=");
    expect(setCookie.join("\n")).not.toContain("refreshToken=");
  });

  test("two different clients see the latest 2FA state (consistency)", async () => {
    const user = await createUser({
      email: "toggle2fa-multi@example.com",
      password: "secret123",
      twoFactorEnabled: false,
    });

    const agent1 = await loginAgent({
      email: "toggle2fa-multi@example.com",
      password: "secret123",
    });

    const agent2 = await loginAgent({
      email: "toggle2fa-multi@example.com",
      password: "secret123",
    });

    const a1 = await agent1.get("/api/auth/2fa/toggle");
    expect(a1.status).toBe(200);
    expect(a1.body.data.enabled).toBe(true);

    // agent2 toggles back off
    const a2 = await agent2.get("/api/auth/2fa/toggle");
    expect(a2.status).toBe(200);
    expect(a2.body.data.enabled).toBe(false);

    const fresh = await User.findById(user._id);
    expect(fresh.twoFactorEnabled).toBe(false);
  });
});
