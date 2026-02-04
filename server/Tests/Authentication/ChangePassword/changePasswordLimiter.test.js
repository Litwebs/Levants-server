const request = require("supertest");
const express = require("express");

describe("change-password rate limiter", () => {
  test("triggers (returns 429) and sets Retry-After + RateLimit headers", async () => {
    const {
      createRateLimiter,
    } = require("../../../middleware/rateLimit.middleware");

    // tiny limit to trigger quickly
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 3,
      message: "Too many requests, please slow down.",
    });

    const app = express();
    app.set("trust proxy", true);
    app.use(express.json());

    // simulate change-password route
    app.post("/api/auth/change-password", limiter, (_req, res) => {
      // mimic "protected endpoint" response (doesn't matter; limiter should block first)
      res.status(401).json({ success: false });
    });

    let res = null;

    for (let i = 0; i < 10; i++) {
      res = await request(app)
        .post("/api/auth/change-password")
        .set("X-Forwarded-For", "10.0.0.121") // fixed IP bucket
        .send({
          currentPassword: "oldpass123",
          newPassword: "newpass123",
          confirmNewPassword: "newpass123",
        });

      if (res.status === 429) break;
    }

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeTruthy();
    expect(res.headers["ratelimit-limit"]).toBeTruthy();
  });
});
