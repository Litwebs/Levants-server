const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("GET /api/admin/products (E2E)", () => {
  test("401 unauthenticated", async () => {
    const res = await request(app).get("/api/admin/products");
    expect(res.status).toBe(401);
  });

  test("200 admin lists products", async () => {
    const admin = await createUser({ role: "admin" });

    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });

    const res = await request(app)
      .get("/api/admin/products")
      .set("Cookie", getSetCookieHeader(login));

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.products)).toBe(true);
  });
});
