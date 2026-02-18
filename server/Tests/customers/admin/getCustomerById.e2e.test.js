const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("GET /api/admin/customers/:customerId (E2E)", () => {
  test("401 when not authenticated", async () => {
    const res = await request(app).get(
      "/api/admin/customers/64f000000000000000000000",
    );
    expect(res.status).toBe(401);
  });

  // ⚠️ Your system hides resource and returns 404
  test("404 when authenticated but not admin", async () => {
    const user = await createUser({ role: "staff" });

    const login = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/customers/64f000000000000000000000")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(404);
  });

  test("400 when customerId is invalid ObjectId", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/customers/not-a-valid-id")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(400);
  });
});
