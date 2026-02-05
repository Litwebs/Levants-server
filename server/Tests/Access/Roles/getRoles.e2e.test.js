const request = require("supertest");
const app = require("../../testApp");
const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("GET /api/access/roles (E2E)", () => {
  test("401 when not authenticated", async () => {
    const res = await request(app).get("/api/access/roles");
    expect(res.status).toBe(401);
  });

  test("403 when authenticated but not admin", async () => {
    const user = await createUser({ role: "staff" });
    const login = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/access/roles")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(403);
  });

  test("200 when admin", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/access/roles")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.roles)).toBe(true);
    expect(res.body.data.roles.length).toBeGreaterThan(0);
  });
});
