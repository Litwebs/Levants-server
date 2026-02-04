const request = require("supertest");
const express = require("express");

describe("forgot-password rate limiter", () => {
  test("triggers (returns 429) and sets Retry-After + RateLimit headers", async () => {
    const {
      createRateLimiter,
    } = require("../../../middleware/rateLimit.middleware");

    // tiny limiter so it triggers quickly and never flakes
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 3,
      message: "Too many requests, please slow down.",
    });

    const app = express();
    app.set("trust proxy", true);
    app.use(express.json());

    // simulate forgot-password route: response code before limiting doesn't matter
    app.post("/api/auth/forgot-password", limiter, (_req, res) => {
      res.status(200).json({ success: true, data: null, message: "ok" });
    });

    let res = null;

    for (let i = 0; i < 10; i++) {
      res = await request(app)
        .post("/api/auth/forgot-password")
        .set("X-Forwarded-For", "10.0.0.91")
        .send({ email: "a@b.com" });

      if (res.status === 429) break;
    }

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeTruthy();
    expect(res.headers["ratelimit-limit"]).toBeTruthy();
  });
});
