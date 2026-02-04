const request = require("supertest");
const express = require("express");

describe("2FA verify rate limiter", () => {
  test("triggers (returns 429) and sets Retry-After + RateLimit headers", async () => {
    const {
      createRateLimiter,
    } = require("../../../middleware/rateLimit.middleware");

    // Tiny limit so the test is fast + stable
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 3,
      message: "Too many requests, please slow down.",
    });

    const app = express();
    app.set("trust proxy", true);
    app.use(express.json());

    // Simulate the real endpoint behind a limiter
    app.post("/api/auth/2fa/verify", limiter, (_req, res) => {
      // If limiter does not block, respond like a typical auth failure
      res.status(401).json({ success: false });
    });

    let res = null;

    for (let i = 0; i < 20; i++) {
      res = await request(app)
        .post("/api/auth/2fa/verify")
        .set("X-Forwarded-For", "10.0.0.77") // fixed IP bucket
        .send({ tempToken: "x", code: "000000" });

      if (res.status === 429) break;

      // before limiter triggers, we expect the handler response
      expect(res.status).toBe(401);
    }

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeTruthy();
    expect(res.headers["ratelimit-limit"]).toBeTruthy();

    // Your handler sets this code
    expect(res.body?.code || res.body?.error?.code).toBe("TOO_MANY_REQUESTS");
  });
});
