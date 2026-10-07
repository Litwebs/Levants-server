const request = require("supertest");
const app = require("../testApp");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");

describe("GET /api/admin/analytics/recurring-vs-one-time", () => {
  test("401 unauthenticated and 403 without analytics.read", async () => {
    expect((await request(app).get("/api/admin/analytics/recurring-vs-one-time?range=today")).status).toBe(401);
    const driver = await createUser({ role:"driver" });
    const login = await request(app).post("/api/auth/login").send({ email:driver.email, password:"secret123" });
    const res = await request(app).get("/api/admin/analytics/recurring-vs-one-time?range=today").set("Cookie",getSetCookieHeader(login));
    expect(res.status).toBe(403);
  });

  test("200 returns stable empty comparison shape", async () => {
    const admin = await createUser({ role:"admin" });
    const login = await request(app).post("/api/auth/login").send({ email:admin.email, password:"secret123" });
    const res = await request(app)
      .get("/api/admin/analytics/recurring-vs-one-time?range=custom&from=2026-01-01&to=2026-01-02&orderSource=imported")
      .set("Cookie",getSetCookieHeader(login));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(expect.objectContaining({
      oneTime:expect.objectContaining({netRevenue:0}),
      subscription:expect.objectContaining({netRevenue:0}),
      importedExcluded:expect.objectContaining({netRevenue:0}),
      comparedTotals:expect.objectContaining({netRevenue:0,totalOrders:0}),
    }));
  });
});
