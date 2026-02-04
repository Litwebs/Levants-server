const request = require("supertest");
const express = require("express");

describe("me (auth) rate limiter", () => {
  test("triggers (returns 429) and sets Retry-After", async () => {
    const {
      createRateLimiter,
    } = require("../../../middleware/rateLimit.middleware");

    // mimic authLimiter but tiny so it triggers fast
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 3,
      message: "Too many requests, please slow down.",
    });

    const app = express();
    app.set("trust proxy", true);

    // simulate /me: normally would be 401 without auth
    app.get("/api/auth/me", limiter, (_req, res) => {
      res.status(401).json({ success: false });
    });

    let res = null;

    for (let i = 0; i < 10; i++) {
      res = await request(app)
        .get("/api/auth/me")
        .set("X-Forwarded-For", "10.0.0.88");

      if (res.status === 429) break;
    }

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeTruthy();
    expect(res.headers["ratelimit-limit"]).toBeTruthy();
  });
});
