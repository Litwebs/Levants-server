const request = require("supertest");
const express = require("express");

describe("api rate limiter (used by /api/auth/refresh)", () => {
  test("triggers (returns 429) and sets Retry-After", async () => {
    const {
      createRateLimiter,
    } = require("../../../middleware/rateLimit.middleware");

    // mimic apiLimiter but keep it tiny so it triggers quickly
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 3,
      message: "Too many requests, please slow down.",
    });

    const app = express();
    app.set("trust proxy", true);
    app.use(express.json());

    // simulate /refresh – response code before limiting doesn't matter
    app.post("/api/auth/refresh", limiter, (_req, res) => {
      res.status(401).json({ success: false }); // like "no refresh token"
    });

    let res = null;

    for (let i = 0; i < 10; i++) {
      res = await request(app)
        .post("/api/auth/refresh")
        .set("X-Forwarded-For", "10.0.0.51")
        .send({});

      if (res.status === 429) break;
    }

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeTruthy();
    expect(res.headers["ratelimit-limit"]).toBeTruthy();
  });
});
