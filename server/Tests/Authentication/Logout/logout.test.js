const request = require("supertest");

const Session = require("../../../models/session.model");
const jwtUtil = require("../../../utils/jwt.util");
const { createUser } = require("../../helpers/authTestData");
const {
  getSetCookieHeader,
  getCookieValueFromSetCookie,
} = require("../../helpers/cookies");
const app = require("../../testApp");

describe("GET /api/auth/logout", () => {
  // 1) Successful logout should revoke session, clear cookies, return 204
  test("revokes session, clears cookies, returns 204", async () => {
    await createUser({ email: "t@example.com", password: "secret123" });

    const agent = request.agent(app);

    const loginRes = await agent.post("/api/auth/login").send({
      email: "t@example.com",
      password: "secret123",
      rememberMe: true,
    });
    expect(loginRes.status).toBe(200);

    const loginCookies = getSetCookieHeader(loginRes);
    const refreshToken = getCookieValueFromSetCookie(
      loginCookies,
      "refreshToken",
    );
    expect(refreshToken).toBeTruthy();

    const payload = jwtUtil.verifyRefreshToken(refreshToken);
    const before = await Session.findById(payload.sid);
    expect(before).toBeTruthy();
    expect(before.revokedAt).toBeFalsy();

    const res = await agent.get("/api/auth/logout");
    expect(res.status).toBe(204);

    const setCookie = getSetCookieHeader(res).join("\n");
    expect(setCookie).toContain("refreshToken=");
    expect(setCookie).toContain("accessToken=");

    const after = await Session.findById(payload.sid);
    expect(after).toBeTruthy();
    expect(after.revokedAt).toBeTruthy();
    expect(after.revokedReason).toBe("LOGOUT");
  });
  // 2) Logout should return 204 even if no cookies are sent
  test("returns 204 even without cookies", async () => {
    const res = await request(app).get("/api/auth/logout");

    expect(res.status).toBe(204);

    const setCookie = getSetCookieHeader(res).join("\n");
    expect(setCookie).toContain("refreshToken=");
    expect(setCookie).toContain("accessToken=");
  });

  // 3) After logout, refresh should fail (session revoked)
  test("prevents refresh after logout (revoked session)", async () => {
    await createUser({
      email: "logout-refresh@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);

    const loginRes = await agent.post("/api/auth/login").send({
      email: "logout-refresh@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const logoutRes = await agent.get("/api/auth/logout");
    expect(logoutRes.status).toBe(204);

    // same agent still has cookies (cleared), refresh should fail
    const refreshRes = await agent.post("/api/auth/refresh").send({});
    expect(refreshRes.status).toBe(401);
    expect(refreshRes.body.success).toBe(false);
  });

  // 4) After logout, /me should fail (no longer authenticated)
  test("prevents access to /me after logout", async () => {
    await createUser({ email: "logout-me@example.com", password: "secret123" });

    const agent = request.agent(app);

    const loginRes = await agent.post("/api/auth/login").send({
      email: "logout-me@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const meBefore = await agent.get("/api/auth/me");
    expect(meBefore.status).toBe(200);

    const logoutRes = await agent.get("/api/auth/logout");
    expect(logoutRes.status).toBe(204);

    const meAfter = await agent.get("/api/auth/me");
    expect(meAfter.status).toBe(401);
  });

  // 5) Idempotent: calling logout twice stays 204 and session remains revoked
  test("is idempotent (second logout still 204 and session stays revoked)", async () => {
    await createUser({
      email: "logout-twice@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);

    const loginRes = await agent.post("/api/auth/login").send({
      email: "logout-twice@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const cookies = getSetCookieHeader(loginRes);
    const refreshToken = getCookieValueFromSetCookie(cookies, "refreshToken");
    const payload = jwtUtil.verifyRefreshToken(refreshToken);

    const first = await agent.get("/api/auth/logout");
    expect(first.status).toBe(204);

    const second = await agent.get("/api/auth/logout");
    expect(second.status).toBe(204);

    const session = await Session.findById(payload.sid);
    expect(session).toBeTruthy();
    expect(session.revokedAt).toBeTruthy();
    expect(session.revokedReason).toBe("LOGOUT");
  });

  // 6) Logout with invalid refresh token cookie should still return 204 and clear cookies
  test("returns 204 and clears cookies even with invalid refresh token cookie", async () => {
    const res = await request(app)
      .get("/api/auth/logout")
      .set("Cookie", ["refreshToken=not-a-jwt; accessToken=also-not-a-jwt"]);

    expect(res.status).toBe(204);

    const setCookie = getSetCookieHeader(res).join("\n");
    expect(setCookie).toContain("refreshToken=");
    expect(setCookie).toContain("accessToken=");
  });

  // 7) Logout should revoke ONLY the current session (not all sessions)
  test("revokes only the current session (other sessions remain active)", async () => {
    await createUser({
      email: "logout-multi@example.com",
      password: "secret123",
    });

    const agent1 = request.agent(app);
    const agent2 = request.agent(app);

    // login on agent1 -> session1
    const login1 = await agent1.post("/api/auth/login").send({
      email: "logout-multi@example.com",
      password: "secret123",
    });
    expect(login1.status).toBe(200);
    const rt1 = getCookieValueFromSetCookie(
      getSetCookieHeader(login1),
      "refreshToken",
    );
    const p1 = jwtUtil.verifyRefreshToken(rt1);

    // login on agent2 -> session2
    const login2 = await agent2.post("/api/auth/login").send({
      email: "logout-multi@example.com",
      password: "secret123",
    });
    expect(login2.status).toBe(200);
    const rt2 = getCookieValueFromSetCookie(
      getSetCookieHeader(login2),
      "refreshToken",
    );
    const p2 = jwtUtil.verifyRefreshToken(rt2);

    expect(p1.sid).not.toBe(p2.sid);

    // logout only agent1
    const logout1 = await agent1.get("/api/auth/logout");
    expect(logout1.status).toBe(204);

    const s1 = await Session.findById(p1.sid);
    const s2 = await Session.findById(p2.sid);

    expect(s1).toBeTruthy();
    expect(s1.revokedAt).toBeTruthy();

    expect(s2).toBeTruthy();
    expect(s2.revokedAt).toBeFalsy();

    // agent2 should still be able to refresh
    const refresh2 = await agent2.post("/api/auth/refresh").send({});
    expect(refresh2.status).toBe(200);
    expect(refresh2.body.success).toBe(true);
  });

  // 8) Logout clears cookies with an expiry in the past (best-effort check)
  test("clears cookies by expiring them", async () => {
    await createUser({
      email: "logout-expire@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/auth/login").send({
      email: "logout-expire@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const res = await agent.get("/api/auth/logout");
    expect(res.status).toBe(204);

    const setCookie = getSetCookieHeader(res).join("\n");

    // These are common patterns for clearing cookies; adjust if your implementation differs.
    expect(setCookie).toMatch(/refreshToken=.*(Expires=|Max-Age=0)/i);
    expect(setCookie).toMatch(/accessToken=.*(Expires=|Max-Age=0)/i);
  });
});
