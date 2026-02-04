const request = require("supertest");
const express = require("express");

describe("logout rate limiter", () => {
  test("triggers (returns 429) and sets Retry-After", async () => {
    const {
      createRateLimiter,
    } = require("../../../middleware/rateLimit.middleware");

    // tiny limit so it triggers fast
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 3,
      message: "Too many requests, please slow down.",
    });

    const app = express();
    app.set("trust proxy", true);

    app.get("/api/auth/logout", limiter, (_req, res) => {
      // mimic your logout: returns 204 when not rate-limited
      res.status(204).end();
    });

    let res = null;
    for (let i = 0; i < 10; i++) {
      res = await request(app)
        .get("/api/auth/logout")
        .set("X-Forwarded-For", "10.0.0.60"); // fixed IP bucket

      if (res.status === 429) break;
    }

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeTruthy();
    expect(res.headers["ratelimit-limit"]).toBeTruthy();
  });
});
