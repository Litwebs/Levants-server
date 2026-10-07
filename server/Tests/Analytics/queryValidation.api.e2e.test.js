const request = require("supertest");
const app = require("../testApp");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");

describe("analytics query validation", () => {
  const loginAdmin = async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });
    return getSetCookieHeader(login);
  };

  test.each([
    ["/api/admin/analytics/dashboard?range=banana", "range"],
    ["/api/admin/analytics/dashboard?orderSource=mobile", "source"],
    ["/api/admin/analytics/revenue?interval=hour", "interval"],
    ["/api/admin/analytics/dashboard?range=custom", "both from and to"],
    [
      "/api/admin/analytics/dashboard?from=2026-06-01",
      "both from and to",
    ],
    [
      "/api/admin/analytics/dashboard?from=2026-02-30&to=2026-03-01",
      "valid calendar dates",
    ],
    [
      "/api/admin/analytics/dashboard?from=2026-06-10&to=2026-06-01",
      "on or before",
    ],
    [
      "/api/admin/analytics/dashboard?range=last7&from=2026-06-01&to=2026-06-07",
      "either a named analytics range",
    ],
    ["/api/admin/analytics/top-products?limit=26", "between 1 and 25"],
    ["/api/admin/analytics/recent-orders?limit=0", "between 1 and 25"],
    ["/api/admin/analytics/low-stock?limit=201", "between 1 and 200"],
    ["/api/admin/analytics/revenue-overview?days=91", "between 7 and 90"],
  ])("rejects invalid query %s", async (url, messagePart) => {
    const cookie = await loginAdmin();
    const res = await request(app).get(url).set("Cookie", cookie);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toContain(messagePart);
    expect(res.body.error).toEqual({
      code: "INVALID_ANALYTICS_QUERY",
    });
  });

  test("rejects an excessive daily custom range before analytics work runs", async () => {
    const cookie = await loginAdmin();

    const res = await request(app)
      .get(
        "/api/admin/analytics/revenue?interval=day&from=2020-01-01&to=2026-01-01",
      )
      .set("Cookie", cookie);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("maximum is 1000");
    expect(res.body.message).toContain("coarser interval");
  });

  test("allows the same long range when a bounded coarser interval is used", async () => {
    const cookie = await loginAdmin();

    const res = await request(app)
      .get(
        "/api/admin/analytics/revenue?interval=month&from=2020-01-01&to=2026-01-01",
      )
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.interval).toBe("month");
    expect(res.body.data.points).toHaveLength(73);
  });

  test("accepts subscription as a first-class analytics source", async () => {
    const cookie = await loginAdmin();

    const res = await request(app)
      .get(
        "/api/admin/analytics/dashboard?range=today&orderSource=subscription&interval=day",
      )
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
  test("rejects unbounded daily or weekly all-time series", async () => {
    const cookie = await loginAdmin();

    for (const interval of ["day", "week"]) {
      const res = await request(app)
        .get(`/api/admin/analytics/revenue?range=all&interval=${interval}`)
        .set("Cookie", cookie);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain("monthly or yearly");
    }
  });

  test("all-time analytics allow bounded-granularity monthly series", async () => {
    const cookie = await loginAdmin();

    const res = await request(app)
      .get("/api/admin/analytics/revenue?range=all&interval=month")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.interval).toBe("month");
  });

});
