const request = require("supertest");
const express = require("express");

describe("reset-password rate limiter", () => {
  test("triggers (returns 429) and sets Retry-After + RateLimit headers", async () => {
    const {
      createRateLimiter,
    } = require("../../../middleware/rateLimit.middleware");

    // tiny limit so it triggers quickly
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 3,
      message: "Too many requests, please slow down.",
    });

    const app = express();
    app.set("trust proxy", true);
    app.use(express.json());

    // simulate the reset-password route
    app.post("/api/auth/reset-password", limiter, (_req, res) => {
      // normal response doesn't matter; limiter should block first
      res.status(400).json({ success: false });
    });

    let res = null;

    for (let i = 0; i < 10; i++) {
      res = await request(app)
        .post("/api/auth/reset-password")
        .set("X-Forwarded-For", "10.0.0.111") // fixed IP bucket
        .send({ token: "x", newPassword: "y" });

      if (res.status === 429) break;
    }

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeTruthy();
    expect(res.headers["ratelimit-limit"]).toBeTruthy();
  });
});
