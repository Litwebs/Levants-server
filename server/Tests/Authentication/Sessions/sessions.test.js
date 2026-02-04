const request = require("supertest");

const jwtUtil = require("../../../utils/jwt.util");
const { createUser } = require("../../helpers/authTestData");
const {
  getSetCookieHeader,
  getCookieValueFromSetCookie,
} = require("../../helpers/cookies");
const app = require("../../testApp");

describe("GET /api/auth/sessions (E2E)", () => {
  // check that authentication is required
  test("requires authentication", async () => {
    const res = await request(app).get("/api/auth/sessions");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // check that it returns sessions for the logged-in user
  test("returns active sessions and marks the current session", async () => {
    await createUser({ email: "t@example.com", password: "secret123" });

    const agent1 = request.agent(app);
    const agent2 = request.agent(app);

    const login1 = await agent1.post("/api/auth/login").send({
      email: "t@example.com",
      password: "secret123",
    });
    expect(login1.status).toBe(200);

    const login2 = await agent2.post("/api/auth/login").send({
      email: "t@example.com",
      password: "secret123",
    });
    expect(login2.status).toBe(200);

    const rt1 = getCookieValueFromSetCookie(
      getSetCookieHeader(login1),
      "refreshToken",
    );
    const rt2 = getCookieValueFromSetCookie(
      getSetCookieHeader(login2),
      "refreshToken",
    );

    expect(rt1).toBeTruthy();
    expect(rt2).toBeTruthy();

    const sid1 = jwtUtil.verifyRefreshToken(rt1).sid;
    const sid2 = jwtUtil.verifyRefreshToken(rt2).sid;

    expect(sid1).toBeTruthy();
    expect(sid2).toBeTruthy();
    expect(String(sid1)).not.toBe(String(sid2));

    const res = await agent1.get("/api/auth/sessions");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.sessions)).toBe(true);

    const sessions = res.body.data.sessions;

    const s1 = sessions.find((s) => String(s._id) === String(sid1));
    const s2 = sessions.find((s) => String(s._id) === String(sid2));

    expect(s1).toBeTruthy();
    expect(s2).toBeTruthy();

    expect(s1.isCurrent).toBe(true);
    expect(s2.isCurrent).toBe(false);

    // Ensure we don't leak token hashes
    expect(s1.refreshTokenHash).toBeUndefined();
    expect(s2.refreshTokenHash).toBeUndefined();
  });

  // check that when no refreshToken cookie is sent, all sessions are isCurrent:false
  test("when refreshToken cookie is missing, all sessions are isCurrent:false", async () => {
    await createUser({ email: "no-rt@example.com", password: "secret123" });

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "no-rt@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const cookies = getSetCookieHeader(loginRes);
    const accessToken = getCookieValueFromSetCookie(cookies, "accessToken");
    expect(accessToken).toBeTruthy();

    const res = await request(app)
      .get("/api/auth/sessions")
      .set("Cookie", [`accessToken=${accessToken}`]);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.sessions)).toBe(true);
    expect(res.body.data.sessions.length).toBeGreaterThan(0);
    expect(res.body.data.sessions.every((s) => s.isCurrent === false)).toBe(
      true,
    );
  });

  // check that tampered accessToken cookie is rejected
  test("does not accept a tampered accessToken cookie", async () => {
    const res = await request(app)
      .get("/api/auth/sessions")
      .set("Cookie", ["accessToken=not-a-jwt"]);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // check that after logout, sessions endpoint requires auth again
  test("after logout, sessions endpoint requires auth again", async () => {
    await createUser({
      email: "sessions-logout@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);

    const loginRes = await agent.post("/api/auth/login").send({
      email: "sessions-logout@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const sessionsBefore = await agent.get("/api/auth/sessions");
    expect(sessionsBefore.status).toBe(200);
    expect(sessionsBefore.body.success).toBe(true);

    const logoutRes = await agent.get("/api/auth/logout");
    expect(logoutRes.status).toBe(204);

    const sessionsAfter = await agent.get("/api/auth/sessions");
    expect(sessionsAfter.status).toBe(401);
    expect(sessionsAfter.body.success).toBe(false);
  });

  // check that revoked sessions do not appear
  test("does not return revoked sessions (if your controller filters them out)", async () => {
    // If your API *does* return revoked sessions, change the assertions accordingly.
    const Session = require("../../../models/session.model");

    await createUser({
      email: "sessions-revoked@example.com",
      password: "secret123",
    });

    const agent1 = request.agent(app);
    const agent2 = request.agent(app);

    const login1 = await agent1.post("/api/auth/login").send({
      email: "sessions-revoked@example.com",
      password: "secret123",
    });
    expect(login1.status).toBe(200);

    const login2 = await agent2.post("/api/auth/login").send({
      email: "sessions-revoked@example.com",
      password: "secret123",
    });
    expect(login2.status).toBe(200);

    const rt2 = getCookieValueFromSetCookie(
      getSetCookieHeader(login2),
      "refreshToken",
    );
    const sid2 = jwtUtil.verifyRefreshToken(rt2).sid;

    // revoke session2 directly
    const s2 = await Session.findById(sid2);
    expect(s2).toBeTruthy();
    await s2.revoke("TEST_REVOKE");

    const res = await agent1.get("/api/auth/sessions");
    expect(res.status).toBe(200);

    const ids = res.body.data.sessions.map((s) => String(s._id));
    expect(ids).not.toContain(String(sid2));
  });

  // check that sessions are user-specific
  test("returns only sessions belonging to the authenticated user", async () => {
    // Create two users and ensure sessions from user A don't show up for user B
    await createUser({
      email: "sessions-userA@example.com",
      password: "secret123",
    });
    await createUser({
      email: "sessions-userB@example.com",
      password: "secret123",
    });

    const agentA = request.agent(app);
    const agentB = request.agent(app);

    const loginA = await agentA.post("/api/auth/login").send({
      email: "sessions-userA@example.com",
      password: "secret123",
    });
    expect(loginA.status).toBe(200);

    const loginB = await agentB.post("/api/auth/login").send({
      email: "sessions-userB@example.com",
      password: "secret123",
    });
    expect(loginB.status).toBe(200);

    const resA = await agentA.get("/api/auth/sessions");
    expect(resA.status).toBe(200);

    const resB = await agentB.get("/api/auth/sessions");
    expect(resB.status).toBe(200);

    // If your session objects include user id, assert they match.
    // If not, at least ensure the sets of session ids differ.
    const idsA = new Set(resA.body.data.sessions.map((s) => String(s._id)));
    const idsB = new Set(resB.body.data.sessions.map((s) => String(s._id)));

    // there should be no overlap between different users' sessions
    for (const id of idsA) {
      expect(idsB.has(id)).toBe(false);
    }
  });

  // check that sensitive fields are not leaked
  test("does not leak sensitive fields on session objects", async () => {
    await createUser({
      email: "sessions-safe@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/auth/login").send({
      email: "sessions-safe@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    const res = await agent.get("/api/auth/sessions");
    expect(res.status).toBe(200);

    const sessions = res.body.data.sessions;
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThan(0);

    for (const s of sessions) {
      expect(s.refreshTokenHash).toBeUndefined();
      // add any other fields you never want to expose:
      expect(s.ipHash).toBeUndefined();
      expect(s.userAgentRaw).toBeUndefined();
    }
  });

  // check that disabled users cannot access sessions
  test("returns 403 if user is disabled after login (if your requireAuth checks status)", async () => {
    const User = require("../../../models/user.model");

    const user = await createUser({
      email: "sessions-disabled@example.com",
      password: "secret123",
    });

    const agent = request.agent(app);
    const loginRes = await agent.post("/api/auth/login").send({
      email: "sessions-disabled@example.com",
      password: "secret123",
    });
    expect(loginRes.status).toBe(200);

    await User.findByIdAndUpdate(user._id, { status: "disabled" });

    const res = await agent.get("/api/auth/sessions");

    // matches what you saw on /me when disabled
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });
});
