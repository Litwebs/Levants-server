const request = require("supertest");
const app = require("../../testApp");

const { createUser } = require("../../helpers/authTestData");
const { getSetCookieHeader } = require("../../helpers/cookies");

describe("PUT /api/auth/me (E2E)", () => {
  /**
   * AUTH
   */
  test("401 when not authenticated", async () => {
    const res = await request(app).put("/api/auth/me").send({ name: "Hacker" });

    expect(res.status).toBe(401);
  });

  /**
   * SUCCESS PATHS
   */
  test("200 user can update own name", async () => {
    const user = await createUser({ name: "Original Name" });

    const login = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "secret123",
    });

    const res = await request(app)
      .put("/api/auth/me")
      .set("Cookie", getSetCookieHeader(login))
      .send({ name: "Updated Name" });

    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe("Updated Name");
  });

  test("200 user can update preferences", async () => {
    const user = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "secret123",
    });

    const res = await request(app)
      .put("/api/auth/me")
      .set("Cookie", getSetCookieHeader(login))
      .send({
        preferences: {
          theme: "dark",
          language: "fr-FR",
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.user.preferences.theme).toBe("dark");
    expect(res.body.data.user.preferences.language).toBe("fr-FR");
  });

  /**
   * VALIDATION
   */
  test("400 when body is empty", async () => {
    const user = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "secret123",
    });

    const res = await request(app)
      .put("/api/auth/me")
      .set("Cookie", getSetCookieHeader(login))
      .send({});

    expect(res.status).toBe(400);
  });

  test("400 when invalid preference value", async () => {
    const user = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "secret123",
    });

    const res = await request(app)
      .put("/api/auth/me")
      .set("Cookie", getSetCookieHeader(login))
      .send({
        preferences: { theme: "neon" },
      });

    expect(res.status).toBe(400);
  });

  /**
   * SECURITY / PRIVILEGE ESCALATION
   */
  test("400 when attempting to update roleId", async () => {
    const user = await createUser({ role: "staff" });

    const login = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "secret123",
    });

    const res = await request(app)
      .put("/api/auth/me")
      .set("Cookie", getSetCookieHeader(login))
      .send({ roleId: "64fabcd0000000000000000" });

    expect(res.status).toBe(400);
  });

  test("400 when attempting to update status", async () => {
    const user = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "secret123",
    });

    const res = await request(app)
      .put("/api/auth/me")
      .set("Cookie", getSetCookieHeader(login))
      .send({ status: "disabled" });

    expect(res.status).toBe(400);
  });

  test("400 when attempting to update permissions", async () => {
    const user = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "secret123",
    });

    const res = await request(app)
      .put("/api/auth/me")
      .set("Cookie", getSetCookieHeader(login))
      .send({ permissions: ["users.read"] });

    expect(res.status).toBe(400);
  });

  test("400 when attempting to update password via /me", async () => {
    const user = await createUser();

    const login = await request(app).post("/api/auth/login").send({
      email: user.email,
      password: "secret123",
    });

    const res = await request(app)
      .put("/api/auth/me")
      .set("Cookie", getSetCookieHeader(login))
      .send({ password: "NewPassword123!" });

    expect(res.status).toBe(400);
  });
});
