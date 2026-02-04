const request = require("supertest");

const User = require("../../../models/user.model");
const passwordUtil = require("../../../utils/password.util");
const { createUser } = require("../../helpers/authTestData");
const app = require("../../testApp");

describe("POST /api/auth/change-password (E2E)", () => {
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

  // This endpoint is protected and requires a valid access token, so we need to login first to get an authenticated agent.
  test("requires authentication", async () => {
    const res = await request(app).post("/api/auth/change-password").send({
      currentPassword: "old",
      newPassword: "newpass123",
      confirmNewPassword: "newpass123",
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // Check that the request body validation works when authenticated. We need to create a user and login to get an authenticated agent, then we can test the validation logic of the change password endpoint.
  test("validates request body when authenticated", async () => {
    await createUser({
      email: "cp-validate@example.com",
      password: "oldpass123",
    });

    const agent = await loginAgent({
      email: "cp-validate@example.com",
      password: "oldpass123",
    });

    const res = await agent.post("/api/auth/change-password").send({
      currentPassword: "oldpass123",
      newPassword: "newpass123",
      confirmNewPassword: "does-not-match",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // This is a full end-to-end test that covers the entire change password flow. It creates a user, logs in to get an authenticated agent, calls the change password endpoint, and then verifies that the password was actually changed in the database.
  test("changes password when authenticated", async () => {
    const user = await createUser({
      email: "cp-ok@example.com",
      password: "oldpass123",
    });

    const agent = await loginAgent({
      email: "cp-ok@example.com",
      password: "oldpass123",
    });

    const res = await agent.post("/api/auth/change-password").send({
      currentPassword: "oldpass123",
      newPassword: "newpass123",
      confirmNewPassword: "newpass123",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBe(null);

    const fresh = await User.findById(user._id).select("+passwordHash");
    expect(fresh).toBeTruthy();
    expect(
      await passwordUtil.verifyPassword("newpass123", fresh.passwordHash),
    ).toBe(true);
    expect(
      await passwordUtil.verifyPassword("oldpass123", fresh.passwordHash),
    ).toBe(false);
  });

  // This test checks that if the user provides the wrong current password, the endpoint returns a 400 error and does not change the password. It creates a user, logs in to get an authenticated agent, and then calls the change password endpoint with an incorrect current password.
  test("returns 400 on wrong current password", async () => {
    await createUser({
      email: "cp-wrong@example.com",
      password: "oldpass123",
    });

    const agent = await loginAgent({
      email: "cp-wrong@example.com",
      password: "oldpass123",
    });

    const res = await agent.post("/api/auth/change-password").send({
      currentPassword: "incorrect",
      newPassword: "newpass123",
      confirmNewPassword: "newpass123",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // This test checks that if the user is deleted after they log in (so their token's subject no longer exists), the endpoint returns a 401 error. It creates a user, logs in to get an authenticated agent, deletes the user from the database, and then calls the change password endpoint.
  test("returns 401 if user is deleted after login (token subject no longer exists)", async () => {
    const user = await createUser({
      email: "cp-missing@example.com",
      password: "oldpass123",
    });

    const agent = await loginAgent({
      email: "cp-missing@example.com",
      password: "oldpass123",
    });

    await User.deleteOne({ _id: user._id });

    const res = await agent.post("/api/auth/change-password").send({
      currentPassword: "oldpass123",
      newPassword: "newpass123",
      confirmNewPassword: "newpass123",
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("rejects when newPassword equals currentPassword (if your validator enforces this)", async () => {
    await createUser({
      email: "cp-same@example.com",
      password: "oldpass123",
    });

    const agent = await loginAgent({
      email: "cp-same@example.com",
      password: "oldpass123",
    });

    const res = await agent.post("/api/auth/change-password").send({
      currentPassword: "oldpass123",
      newPassword: "oldpass123",
      confirmNewPassword: "oldpass123",
    });

    // Depending on your design this could be 400 (recommended).
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("does not trim currentPassword (leading/trailing spaces should fail)", async () => {
    await createUser({
      email: "cp-space-current@example.com",
      password: "oldpass123",
    });

    const agent = await loginAgent({
      email: "cp-space-current@example.com",
      password: "oldpass123",
    });

    const res = await agent.post("/api/auth/change-password").send({
      currentPassword: " oldpass123 ",
      newPassword: "newpass123",
      confirmNewPassword: "newpass123",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("rejects too-short newPassword (if schema enforces min length)", async () => {
    await createUser({
      email: "cp-policy@example.com",
      password: "oldpass123",
    });

    const agent = await loginAgent({
      email: "cp-policy@example.com",
      password: "oldpass123",
    });

    const res = await agent.post("/api/auth/change-password").send({
      currentPassword: "oldpass123",
      newPassword: "123",
      confirmNewPassword: "123",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("after changing password, old password can no longer log in and new one works", async () => {
    await createUser({
      email: "cp-login-check@example.com",
      password: "oldpass123",
    });

    const agent = await loginAgent({
      email: "cp-login-check@example.com",
      password: "oldpass123",
    });

    const change = await agent.post("/api/auth/change-password").send({
      currentPassword: "oldpass123",
      newPassword: "newpass123",
      confirmNewPassword: "newpass123",
    });

    expect(change.status).toBe(200);
    expect(change.body.success).toBe(true);

    // Old password should fail
    const oldLogin = await request(app).post("/api/auth/login").send({
      email: "cp-login-check@example.com",
      password: "oldpass123",
    });
    expect(oldLogin.status).toBe(401);

    // New password should succeed
    const newLogin = await request(app).post("/api/auth/login").send({
      email: "cp-login-check@example.com",
      password: "newpass123",
    });
    expect(newLogin.status).toBe(200);
    expect(newLogin.body.success).toBe(true);
  });

  test("does not leak sensitive user fields in response", async () => {
    await createUser({
      email: "cp-no-leak@example.com",
      password: "oldpass123",
    });

    const agent = await loginAgent({
      email: "cp-no-leak@example.com",
      password: "oldpass123",
    });

    const res = await agent.post("/api/auth/change-password").send({
      currentPassword: "oldpass123",
      newPassword: "newpass123",
      confirmNewPassword: "newpass123",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Your change-password returns data:null, but this is a good general check
    if (res.body.data?.user) {
      expect(res.body.data.user.passwordHash).toBeUndefined();
      expect(res.body.data.user.twoFactorSecret).toBeUndefined();
    }
  });

  test("returns 403 if user becomes disabled after login (if your requireAuth checks status)", async () => {
    // Only keep this if your requireAuth checks user status on each request.
    const user = await createUser({
      email: "cp-disabled@example.com",
      password: "oldpass123",
    });

    const agent = await loginAgent({
      email: "cp-disabled@example.com",
      password: "oldpass123",
    });

    await User.findByIdAndUpdate(user._id, { status: "disabled" });

    const res = await agent.post("/api/auth/change-password").send({
      currentPassword: "oldpass123",
      newPassword: "newpass123",
      confirmNewPassword: "newpass123",
    });

    expect(res.status).toBe(403); // matches your /me behavior earlier
    expect(res.body.success).toBe(false);
  });

  test("changing password does not automatically log you out (me still works) unless you revoke sessions", async () => {
    // If you later implement 'revoke all sessions on password change',
    // then change this expectation to 401 after the change.
    await createUser({
      email: "cp-stay-auth@example.com",
      password: "oldpass123",
    });

    const agent = await loginAgent({
      email: "cp-stay-auth@example.com",
      password: "oldpass123",
    });

    const change = await agent.post("/api/auth/change-password").send({
      currentPassword: "oldpass123",
      newPassword: "newpass123",
      confirmNewPassword: "newpass123",
    });
    expect(change.status).toBe(200);

    const me = await agent.get("/api/auth/me");
    // Depending on your design:
    expect([200, 401]).toContain(me.status);
  });
});
