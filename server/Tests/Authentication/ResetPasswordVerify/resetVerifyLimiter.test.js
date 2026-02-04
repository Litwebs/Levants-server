const request = require("supertest");
const express = require("express");

describe("reset-password/verify rate limiter", () => {
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

    // simulate the verify route (response before limiting doesn't matter)
    app.get("/api/auth/reset-password/verify", limiter, (_req, res) => {
      res.status(400).json({ success: false }); // e.g. missing token
    });

    let res = null;

    for (let i = 0; i < 10; i++) {
      res = await request(app)
        .get("/api/auth/reset-password/verify")
        .set("X-Forwarded-For", "10.0.0.101");

      if (res.status === 429) break;
    }

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeTruthy();
    expect(res.headers["ratelimit-limit"]).toBeTruthy();
  });
});
