const request = require("supertest");
const express = require("express");

describe("login rate limiter", () => {
  test("triggers (returns 429) and sets Retry-After", async () => {
    const {
      createRateLimiter,
    } = require("../../../middleware/rateLimit.middleware");

    // force a tiny limit for the test
    const limiter = createRateLimiter({
      windowMs: 60_000,
      max: 3,
      message: "Too many login attempts, please try again later.",
    });

    const app = express();
    app.set("trust proxy", true);
    app.use(express.json());

    app.post("/api/auth/login", limiter, (_req, res) => {
      // if limiter doesn't block, respond like a typical login failure
      res.status(401).json({ success: false });
    });

    let res = null;
    for (let i = 0; i < 10; i++) {
      res = await request(app)
        .post("/api/auth/login")
        .set("X-Forwarded-For", "10.0.0.50") // fixed IP so limiter counts properly
        .send({ email: "a@b.com", password: "wrong" });

      if (res.status === 429) break;
    }

    expect(res.status).toBe(429);
    expect(res.headers["retry-after"]).toBeTruthy();
    expect(res.headers["ratelimit-limit"]).toBeTruthy();
  });
});
