// Tests/Access/Permissions/getPermissions.e2e.test.js

const request = require("supertest");
const app = require("../../testApp");
const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");
const { PERMISSIONS } = require("../../../constants/Auth.constants");

describe("GET /api/access/permissions (E2E)", () => {
  test("401 when not authenticated", async () => {
    const res = await request(app).get("/api/access/permissions");
    expect(res.status).toBe(401);
  });

  test("403 when authenticated but not admin", async () => {
    const user = await createUser({ role: "staff" });

    const login = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/access/permissions")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  test("200 when admin and returns permissions array", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/access/permissions")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.permissions)).toBe(true);
    expect(res.body.data.permissions.length).toBeGreaterThan(0);
  });

  test("permissions match Auth.constants exactly", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/access/permissions")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.body.data.permissions).toEqual(PERMISSIONS);
  });

  test("permissions array contains only strings", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/access/permissions")
      .set("Cookie", getSetCookieHeader(login));

    res.body.data.permissions.forEach((perm) => {
      expect(typeof perm).toBe("string");
    });
  });

  test("401 when admin user was deleted after login", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    await admin.deleteOne();

    const res = await request(app)
      .get("/api/access/permissions")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(401);
  });
});
