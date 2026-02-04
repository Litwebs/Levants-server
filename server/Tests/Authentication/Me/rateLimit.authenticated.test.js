const request = require("supertest");
const express = require("express");

describe("GET /api/auth/authenticated rate limiter", () => {
  test("triggers (returns 429) and sets Retry-After + RateLimit headers", async () => {
    const {
      createRateLimiter,
    } = require("../../../middleware/rateLimit.middleware");

    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 3,
      message: "Too many requests, please slow down.",
    });

    const app = express();
    app.set("trust proxy", true);

    app.get("/api/auth/authenticated", limiter, (_req, res) => {
      // typical CheckAuth response (200)
      res
        .status(200)
        .json({ success: true, data: { authenticated: false, user: null } });
    });

    let res = null;

    for (let i = 0; i < 20; i++) {
      res = await request(app)
        .get("/api/auth/authenticated")
        .set("X-Forwarded-For", "10.0.0.123"); // stable IP bucket

      if (res.status === 429) break;

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    }

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeTruthy();
    expect(res.headers["ratelimit-limit"]).toBeTruthy();
    expect(res.body?.code || res.body?.error?.code).toBe("TOO_MANY_REQUESTS");
  });
});
