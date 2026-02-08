const request = require("supertest");
const app = require("../../testApp");

describe("RATE LIMITING – PUBLIC /api/customers (E2E)", () => {
  const payload = {
    firstName: "Rate",
    lastName: "Limit",
    email: "ratelimit@test.com",
    phone: "07123456789",
    address: {
      line1: "1 Rate Street",
      city: "Bradford",
      postcode: "BD1 1AA",
      country: "UK",
    },
  };

  /**
   * =========================
   * BASELINE
   * =========================
   */

  test("first request is allowed", async () => {
    const res = await request(app)
      .post("/api/customers")
      .send({ ...payload, email: "baseline@test.com" });

    expect([200, 201]).toContain(res.status);
  });

  /**
   * =========================
   * RATE LIMIT ENFORCEMENT
   * =========================
   */

  test("eventually returns 429 when rate limit exceeded", async () => {
    let rateLimitedResponse = null;

    // fire a burst of requests (no timing assumptions)
    for (let i = 0; i < 50; i++) {
      const res = await request(app)
        .post("/api/customers")
        .send({
          ...payload,
          email: `ratelimit-${i}@test.com`,
        });

      if (res.status === 429) {
        rateLimitedResponse = res;
        break;
      }
    }

    expect(rateLimitedResponse).not.toBeNull();
    expect(rateLimitedResponse.status).toBe(429);
  });

  /**
   * =========================
   * HEADERS
   * =========================
   */

  test("429 response includes rate limit headers", async () => {
    let res429;

    for (let i = 0; i < 50; i++) {
      const res = await request(app)
        .post("/api/customers")
        .send({
          ...payload,
          email: `headers-${i}@test.com`,
        });

      if (res.status === 429) {
        res429 = res;
        break;
      }
    }

    expect(res429).toBeDefined();

    // standard express-rate-limit headers
    expect(res429.headers).toHaveProperty("x-ratelimit-limit");
    expect(res429.headers).toHaveProperty("x-ratelimit-remaining");
    expect(res429.headers).toHaveProperty("retry-after");
  });

  /**
   * =========================
   * ERROR SHAPE
   * =========================
   */

  test("429 response has safe error message", async () => {
    let res429;

    for (let i = 0; i < 50; i++) {
      const res = await request(app)
        .post("/api/customers")
        .send({
          ...payload,
          email: `message-${i}@test.com`,
        });

      if (res.status === 429) {
        res429 = res;
        break;
      }
    }

    expect(res429.body).toBeDefined();
    expect(res429.body.success).toBe(false);

    // Do NOT leak internals
    expect(JSON.stringify(res429.body)).not.toMatch(/stack|trace|memory/i);
  });

  /**
   * =========================
   * SCOPE CHECK
   * =========================
   */

  test("rate limiting is route-specific (does not block unrelated routes)", async () => {
    const res = await request(app).get("/health");

    // or any safe public route you have
    expect([200, 404]).toContain(res.status);
  });
});
