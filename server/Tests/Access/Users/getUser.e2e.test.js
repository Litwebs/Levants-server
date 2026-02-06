const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("GET /api/auth/users/:userId (E2E)", () => {
  /**
   * =========================
   * AUTHENTICATION
   * =========================
   */

  test("401 when request is not authenticated", async () => {
    const res = await request(app).get("/api/auth/users/123");
    expect(res.status).toBe(401);
  });

  /**
   * =========================
   * AUTHORIZATION (RBAC)
   * =========================
   */

  test("403 when authenticated but lacking users.read permission", async () => {
    const staff = await createUser({ role: "staff" });
    const target = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: staff.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(`/api/auth/users/${target._id}`)
      .set("Cookie", getSetCookieHeader(login));

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
      .get("/api/auth/users/not-a-valid-id")
      .set("Cookie", getSetCookieHeader(login));

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
      .get("/api/auth/users/64f000000000000000000000")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(404);
  });

  /**
   * =========================
   * BUSINESS RULES
   * =========================
   */

  test("400 when admin attempts to view their own user via admin route", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(`/api/auth/users/${admin._id}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(400);
  });

  /**
   * =========================
   * SUCCESS PATH
   * =========================
   */

  test("200 admin can view another user's details", async () => {
    const admin = await createUser({ role: "admin" });
    const target = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get(`/api/auth/users/${target._id}`)
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect(res.body.data.user).toMatchObject({
      email: target.email,
      status: target.status,
    });

    // Security: ensure sensitive fields are not leaked
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(res.body.data.user.twoFactorSecret).toBeUndefined();
  });
});
