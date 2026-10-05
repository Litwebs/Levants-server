const request = require("supertest");
const app = require("../testApp");
const { createUser } = require("../helpers/authTestData");
const { getSetCookieHeader } = require("../helpers/cookies");

describe("analytics comparison selector API", () => {
  test("comparison endpoint accepts supported modes", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });
    const cookie = getSetCookieHeader(login);

    const previousYear = await request(app)
      .get(
        "/api/admin/analytics/comparison?range=custom&from=2026-06-10&to=2026-06-10&comparison=previous_year",
      )
      .set("Cookie", cookie);

    expect(previousYear.status).toBe(200);
    expect(previousYear.body.success).toBe(true);
    expect(previousYear.body.data).toEqual(
      expect.objectContaining({
        available: true,
        strategy: "previous_year",
      }),
    );

    const disabled = await request(app)
      .get(
        "/api/admin/analytics/comparison?range=custom&from=2026-06-10&to=2026-06-10&comparison=none",
      )
      .set("Cookie", cookie);

    expect(disabled.status).toBe(200);
    expect(disabled.body.data).toEqual(
      expect.objectContaining({
        available: false,
        reason: "comparison_disabled",
        strategy: "none",
      }),
    );
  });

  test("rejects invalid comparison modes and rejects comparison on unrelated endpoints", async () => {
    const admin = await createUser({ role: "admin" });
    const login = await request(app).post("/api/auth/login").send({
      email: admin.email,
      password: "secret123",
    });
    const cookie = getSetCookieHeader(login);

    const invalid = await request(app)
      .get(
        "/api/admin/analytics/comparison?range=today&comparison=invalid",
      )
      .set("Cookie", cookie);
    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toContain(
      "previous_period, previous_year, or none",
    );

    const unrelated = await request(app)
      .get("/api/admin/analytics/summary?range=today&comparison=previous_year")
      .set("Cookie", cookie);
    expect(unrelated.status).toBe(400);
    expect(unrelated.body.message).toContain(
      "does not accept comparison",
    );
  });
});
