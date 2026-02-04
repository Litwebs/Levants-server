const request = require("supertest");
const express = require("express");

describe("sessions (auth) rate limiter", () => {
  test("triggers (returns 429) and sets Retry-After + RateLimit headers", async () => {
    const { createRateLimiter } = require("../../../middleware/rateLimit.middleware");

    // tiny limiter for deterministic trigger
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 3,
      message: "Too many requests, please slow down.",
    });

    const app = express();
    app.set("trust proxy", true);

    app.get("/api/auth/sessions", limiter, (_req, res) => {
      // mimic unauthenticated behavior (doesn't matter; limiter should still trigger)
      res.status(401).json({ success: false });
    });

    let res = null;

    for (let i = 0; i < 10; i++) {
      res = await request(app)
        .get("/api/auth/sessions")
        .set("X-Forwarded-For", "10.0.0.70"); // fixed IP bucket

      if (res.status === 429) break;
    }

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeTruthy();
    expect(res.headers["ratelimit-limit"]).toBeTruthy();
  });
});
