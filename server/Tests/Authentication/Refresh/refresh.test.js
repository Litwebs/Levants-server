const request = require("supertest");

const Session = require("../../../models/session.model");
const jwtUtil = require("../../../utils/jwt.util");
const cryptoUtil = require("../../../utils/crypto.util");
const { createUser } = require("../../helpers/authTestData");
const {
  getSetCookieHeader,
  getCookieValueFromSetCookie,
} = require("../../helpers/cookies");
const app = require("../../testApp");

describe("POST /api/auth/refresh", () => {
  // 1. Check for successful token rotation
  test("rotates refresh token, keeps session id, returns user", async () => {
    await createUser({ email: "t@example.com", password: "secret123" });

    const agent = request.agent(app);

    const loginRes = await agent.post("/api/auth/login").send({
      email: "t@example.com",
      password: "secret123",
      rememberMe: true,
    });
    expect(loginRes.status).toBe(200);

    const loginCookies = getSetCookieHeader(loginRes);
    const oldRefreshToken = getCookieValueFromSetCookie(
      loginCookies,
      "refreshToken",
    );
    expect(oldRefreshToken).toBeTruthy();

    const oldPayload = jwtUtil.verifyRefreshToken(oldRefreshToken);

    const res = await agent.post("/api/auth/refresh").send({});
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe("t@example.com");

    const setCookie = getSetCookieHeader(res);
    expect(setCookie.join("\n")).toContain("accessToken=");
    expect(setCookie.join("\n")).toContain("refreshToken=");

    const newRefreshToken = getCookieValueFromSetCookie(
      setCookie,
      "refreshToken",
    );
    expect(newRefreshToken).toBeTruthy();
    expect(newRefreshToken).not.toBe(oldRefreshToken);

    const newPayload = jwtUtil.verifyRefreshToken(newRefreshToken);
    expect(newPayload.sid).toBe(oldPayload.sid);

    const session = await Session.findById(newPayload.sid);
    expect(session).toBeTruthy();
    expect(session.revokedAt).toBeFalsy();
    expect(session.refreshTokenHash).toBe(
      cryptoUtil.hashToken(newRefreshToken),
    );
  });

  // 2. Check various failure cases
  test("returns 401 when no refresh token is provided", async () => {
    const res = await request(app).post("/api/auth/refresh").send({});

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 3. Invalid token
  test("returns 401 for invalid refresh token", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", ["refreshToken=not-a-jwt"])
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 4. Revoked session
  test("returns 401 when session is revoked", async () => {
    await createUser({ email: "t@example.com", password: "secret123" });

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/auth/login").send({
      email: "t@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const cookies = getSetCookieHeader(loginRes);
    const refreshToken = getCookieValueFromSetCookie(cookies, "refreshToken");
    const payload = jwtUtil.verifyRefreshToken(refreshToken);

    const session = await Session.findById(payload.sid);
    await session.revoke("TEST_REVOKE");

    const res = await agent.post("/api/auth/refresh").send({});
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 5. Reused token detection
  test("returns 401 when old refresh token is reused after rotation", async () => {
    await createUser({ email: "t@example.com", password: "secret123" });

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/auth/login").send({
      email: "t@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const cookies = getSetCookieHeader(loginRes);
    const oldRefreshToken = getCookieValueFromSetCookie(
      cookies,
      "refreshToken",
    );
    expect(oldRefreshToken).toBeTruthy();

    const rotateRes = await agent.post("/api/auth/refresh").send({});
    expect(rotateRes.status).toBe(200);

    // Simulate attacker reusing the stolen/old token by overriding cookie
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", [`refreshToken=${oldRefreshToken}`])
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 6. Refresh should reject unexpected body fields (if your Joi schema disallows unknown keys)
  test("returns 400 when body contains unexpected fields", async () => {
    await createUser({
      email: "refresh-unknown@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/auth/login").send({
      email: "refresh-unknown@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const res = await agent.post("/api/auth/refresh").send({ extra: "nope" });

    // if your refreshSchema allows unknown, change this to 200
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // 7. Session not found (sid valid but Session doc missing)
  test("returns 401 when session referenced by refresh token does not exist", async () => {
    await createUser({
      email: "refresh-nosess@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/auth/login").send({
      email: "refresh-nosess@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const cookies = getSetCookieHeader(loginRes);
    const refreshToken = getCookieValueFromSetCookie(cookies, "refreshToken");
    expect(refreshToken).toBeTruthy();

    const payload = jwtUtil.verifyRefreshToken(refreshToken);
    expect(payload.sid).toBeTruthy();

    // delete the session so refresh should fail
    await Session.findByIdAndDelete(payload.sid);

    const res = await agent.post("/api/auth/refresh").send({});
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 8. refreshTokenHash mismatch (DB says different token than the cookie)
  test("returns 401 when refresh token hash does not match session", async () => {
    await createUser({
      email: "refresh-hashmismatch@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/auth/login").send({
      email: "refresh-hashmismatch@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const cookies = getSetCookieHeader(loginRes);
    const refreshToken = getCookieValueFromSetCookie(cookies, "refreshToken");
    const payload = jwtUtil.verifyRefreshToken(refreshToken);

    const session = await Session.findById(payload.sid);
    expect(session).toBeTruthy();

    // corrupt the stored hash to simulate mismatch/stolen token
    session.refreshTokenHash = cryptoUtil.hashToken("some-other-token");
    await session.save();

    const res = await agent.post("/api/auth/refresh").send({});
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 9. Refresh should update access token too (cookie value changes)
  test("sets a new access token cookie on refresh", async () => {
    await createUser({
      email: "refresh-access@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/auth/login").send({
      email: "refresh-access@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const loginCookies = getSetCookieHeader(loginRes);
    const oldAccess = getCookieValueFromSetCookie(loginCookies, "accessToken");
    const oldRefresh = getCookieValueFromSetCookie(
      loginCookies,
      "refreshToken",
    );
    expect(oldAccess).toBeTruthy();
    expect(oldRefresh).toBeTruthy();

    const refreshRes = await agent.post("/api/auth/refresh").send({});
    expect(refreshRes.status).toBe(200);

    const newCookies = getSetCookieHeader(refreshRes);
    const newAccess = getCookieValueFromSetCookie(newCookies, "accessToken");
    const newRefresh = getCookieValueFromSetCookie(newCookies, "refreshToken");

    expect(newAccess).toBeTruthy();
    expect(newRefresh).toBeTruthy();
    expect(newAccess).not.toBe(oldAccess);
    expect(newRefresh).not.toBe(oldRefresh);
  });

  // 10. Cookie security flags on refresh response too
  test("sets secure cookie flags on refresh (HttpOnly/SameSite/Path)", async () => {
    await createUser({
      email: "refresh-cookieflags@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/auth/login").send({
      email: "refresh-cookieflags@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const res = await agent.post("/api/auth/refresh").send({});
    expect(res.status).toBe(200);

    const setCookie = getSetCookieHeader(res).join("\n");
    expect(setCookie).toContain("accessToken=");
    expect(setCookie).toContain("refreshToken=");
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=/i);
    expect(setCookie).toMatch(/Path=\//i);
  });

  // 11. Refresh response should not leak sensitive fields
  test("does not return sensitive user fields on refresh", async () => {
    await createUser({
      email: "refresh-safeuser@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/auth/login").send({
      email: "refresh-safeuser@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const res = await agent.post("/api/auth/refresh").send({});
    expect(res.status).toBe(200);

    const user = res.body.data.user;
    expect(user.passwordHash).toBeUndefined();
    expect(user.twoFactorSecret).toBeUndefined();
    expect(user.twoFactorLogin).toBeUndefined();
    expect(user.resetPasswordToken).toBeUndefined();
  });

  // 12. Concurrency: two refresh calls with same cookie - only one should succeed
  test("concurrent refresh: only one request succeeds", async () => {
    await createUser({
      email: "refresh-race@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/auth/login").send({
      email: "refresh-race@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const [r1, r2] = await Promise.all([
      agent.post("/api/auth/refresh").send({}),
      agent.post("/api/auth/refresh").send({}),
    ]);

    const statuses = [r1.status, r2.status];

    // expect one OK
    expect(statuses).toContain(200);

    // and the other should be blocked (usually 401 due to rotation/reuse detection)
    // if you ever add a limiter on refresh, 429 is also acceptable.
    expect([401, 429]).toContain(statuses.find((s) => s !== 200));
  });
});
