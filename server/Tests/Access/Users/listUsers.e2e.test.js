const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("GET /api/auth/users (E2E)", () => {
  /**
   * =========================
   * AUTHENTICATION
   * =========================
   */

  test("401 when request is not authenticated", async () => {
    const res = await request(app).get("/api/auth/users");
    expect(res.status).toBe(401);
  });

  /**
   * =========================
   * AUTHORIZATION (RBAC)
   * =========================
   */

  test("403 when authenticated but lacking users.read permission", async () => {
    const staff = await createUser({ role: "staff" });

    const login = await request(app).post("/api/auth/login").send({
      email: staff.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/auth/users")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  /**
   * =========================
   * SUCCESS PATH
   * =========================
   */

  test("200 admin can list users", async () => {
    const admin = await createUser({ role: "admin" });
    await createUser({ email: "u1@test.com" });
    await createUser({ email: "u2@test.com" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/auth/users")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect(Array.isArray(res.body.data.users)).toBe(true);
    expect(res.body.meta).toMatchObject({
      page: expect.any(Number),
      pageSize: expect.any(Number),
      total: expect.any(Number),
    });

    expect(res.body.meta.total).toBeGreaterThanOrEqual(3);
  });

  /**
   * =========================
   * PAGINATION
   * =========================
   */

  test("200 returns paginated results", async () => {
    const admin = await createUser({ role: "admin" });

    // create multiple users
    for (let i = 0; i < 5; i++) {
      await createUser({ email: `user${i}@test.com` });
    }

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/auth/users?page=1&pageSize=2")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.data.users.length).toBeLessThanOrEqual(2);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.pageSize).toBe(2);
  });

  /**
   * =========================
   * FILTERING
   * =========================
   */

  test("200 filters users by status", async () => {
    const admin = await createUser({ role: "admin" });
    await createUser({ email: "active@test.com", status: "active" });
    await createUser({ email: "disabled@test.com", status: "disabled" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/auth/users?status=disabled")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);

    res.body.data.users.forEach((u) => {
      expect(u.status).toBe("disabled");
    });
  });

  /**
   * =========================
   * SECURITY
   * =========================
   */

  test("does not leak sensitive fields", async () => {
    const admin = await createUser({ role: "admin" });
    await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/auth/users")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);

    const user = res.body.data.users[0];

    expect(user.passwordHash).toBeUndefined();
    expect(user.twoFactorSecret).toBeUndefined();
    expect(user.twoFactorLogin).toBeUndefined();
  });
});
