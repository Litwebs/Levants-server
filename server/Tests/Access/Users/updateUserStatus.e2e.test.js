const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("PUT /api/auth/users/:userId/status (E2E)", () => {
  /**
   * =========================
   * AUTHENTICATION
   * =========================
   */

  test("401 when request is not authenticated", async () => {
    const res = await request(app)
      .put("/api/auth/users/64f000000000000000000000/status")
      .send({ status: "disabled" });

    expect(res.status).toBe(401);
  });

  /**
   * =========================
   * AUTHORIZATION (RBAC)
   * =========================
   */

  test("403 when authenticated but lacking users.update permission", async () => {
    const staff = await createUser({ role: "staff" });
    const target = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: staff.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/auth/users/${target._id}/status`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ status: "disabled" });

    expect(res.status).toBe(403);
  });

  /**
   * =========================
   * VALIDATION
   * =========================
   */

  test("400 when userId is not a valid ObjectId", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put("/api/auth/users/not-a-valid-id/status")
      .set("Cookie", getSetCookieHeader(login))
      .send({ status: "disabled" });

    expect(res.status).toBe(400);
  });

  test("400 when status value is invalid", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser({ status: "active" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/auth/users/${target._id}/status`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ status: "suspended" });

    expect(res.status).toBe(400);
  });

  /**
   * =========================
   * RESOURCE EXISTENCE
   * =========================
   */

  test("404 when target user does not exist", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put("/api/auth/users/64f000000000000000000000/status")
      .set("Cookie", getSetCookieHeader(login))
      .send({ status: "disabled" });

    expect(res.status).toBe(404);
  });

  /**
   * =========================
   * BUSINESS RULES
   * =========================
   */

  test("400 when admin attempts to change their own status", async () => {
    const admin = await createUser({ role: "admin", status: "active" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/auth/users/${admin._id}/status`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ status: "disabled" });

    expect(res.status).toBe(400);
  });

  /**
   * =========================
   * SUCCESS PATH
   * =========================
   */

  test("200 admin can disable a user", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser({ status: "active" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .put(`/api/auth/users/${target._id}/status`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ status: "disabled" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.status).toBe("disabled");
  });

  /**
   * =========================
   * SECURITY / BEHAVIOR
   * =========================
   */

  test("disabled user can no longer authenticate", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser({
      status: "active",
      email: "disabled@test.com",
      password: "secret123",
    });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    await request(app)
      .put(`/api/auth/users/${target._id}/status`)
      .set("Cookie", getSetCookieHeader(login))
      .send({ status: "disabled" });

    const disabledLogin = await request(app).post("/api/auth/login").send({
      email: target.email,
      password: "secret123",
    });

    expect(disabledLogin.status).toBe(401);
  });
});
