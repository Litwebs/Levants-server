const request = require("supertest");

const Session = require("../../../models/session.model");
const jwtUtil = require("../../../utils/jwt.util");
const { createUser } = require("../../helpers/authTestData");
const {
  getSetCookieHeader,
  getCookieValueFromSetCookie,
} = require("../../helpers/cookies");
const app = require("../../testApp");

describe("POST /api/auth/sessions/:sessionId/revoke (E2E)", () => {
  // Helper function to log in and get an agent with cookies and the session ID from the refresh token
  async function loginAgentAndSessionId({ email, password }) {
    const agent = request.agent(app);

    const res = await agent.post("/api/auth/login").send({
      email,
      password,
      rememberMe: false,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const setCookie = getSetCookieHeader(res);
    const refreshToken = getCookieValueFromSetCookie(setCookie, "refreshToken");
    expect(refreshToken).toBeTruthy();

    const payload = jwtUtil.verifyRefreshToken(refreshToken);
    expect(payload?.sid).toBeTruthy();

    return { agent, sessionId: payload.sid };
  }

  // Clean up sessions after each test
  test("requires authentication", async () => {
    const res = await request(app).post("/api/auth/sessions/abc/revoke");

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // The API should prevent revoking the session that is currently being used to make the request
  test("prevents revoking current session", async () => {
    await createUser({
      email: "revoke-current@example.com",
      password: "secret123",
    });

    const { agent, sessionId } = await loginAgentAndSessionId({
      email: "revoke-current@example.com",
      password: "secret123",
    });

    const res = await agent.post(`/api/auth/sessions/${sessionId}/revoke`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(String(res.body.message || "")).toContain(
      "Cannot revoke current session",
    );
  });

  // The API should allow revoking other sessions of the same user
  test("revokes another session", async () => {
    await createUser({
      email: "revoke-other@example.com",
      password: "secret123",
    });

    const { agent: agent1, sessionId: sessionId1 } =
      await loginAgentAndSessionId({
        email: "revoke-other@example.com",
        password: "secret123",
      });

    const { agent: agent2, sessionId: sessionId2 } =
      await loginAgentAndSessionId({
        email: "revoke-other@example.com",
        password: "secret123",
      });

    expect(String(sessionId1)).not.toBe(String(sessionId2));

    const res = await agent1.post(`/api/auth/sessions/${sessionId2}/revoke`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual({ revoked: true });

    const revoked = await Session.findById(sessionId2);
    expect(revoked).toBeTruthy();
    expect(revoked.revokedAt).toBeTruthy();
    expect(revoked.revokedReason).toBe("USER_REVOKE");

    // The revoked session should no longer be able to refresh
    const refresh = await agent2.post("/api/auth/refresh").send({});
    expect(refresh.status).toBe(401);
    expect(refresh.body.success).toBe(false);
  });

  // The API should not allow revoking sessions of other users
  test("returns 404 when trying to revoke a session that belongs to another user (SESSION_NOT_FOUND)", async () => {
    await createUser({ email: "owner-a@example.com", password: "secret123" });
    await createUser({ email: "owner-b@example.com", password: "secret123" });

    const { agent: agentA } = await loginAgentAndSessionId({
      email: "owner-a@example.com",
      password: "secret123",
    });

    const { sessionId: sessionIdB } = await loginAgentAndSessionId({
      email: "owner-b@example.com",
      password: "secret123",
    });

    const res = await agentA.post(`/api/auth/sessions/${sessionIdB}/revoke`);

    // Your controller likely maps SESSION_NOT_FOUND -> 404
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // The API should return 404 if the session ID does not exist at all (even if it's a valid ObjectId format)
  test("returns 404 when session does not exist (valid ObjectId)", async () => {
    await createUser({
      email: "missing-session@example.com",
      password: "secret123",
    });

    const { agent } = await loginAgentAndSessionId({
      email: "missing-session@example.com",
      password: "secret123",
    });

    const missingSessionId = "507f1f77bcf86cd799439011"; // valid ObjectId but not in DB

    const res = await agent.post(
      `/api/auth/sessions/${missingSessionId}/revoke`,
    );

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // The API should return 404 if the session is already revoked (because revokedAt is not null)
  test("revoking an already revoked session returns 404 (because revokedAt is not null)", async () => {
    await createUser({
      email: "already-revoked@example.com",
      password: "secret123",
    });

    const { agent: agent1 } = await loginAgentAndSessionId({
      email: "already-revoked@example.com",
      password: "secret123",
    });

    const { sessionId: sessionId2 } = await loginAgentAndSessionId({
      email: "already-revoked@example.com",
      password: "secret123",
    });

    // First revoke succeeds
    const first = await agent1.post(`/api/auth/sessions/${sessionId2}/revoke`);
    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);

    // Second revoke should fail (SESSION_NOT_FOUND due to revokedAt != null)
    const second = await agent1.post(`/api/auth/sessions/${sessionId2}/revoke`);
    expect(second.status).toBe(404);
    expect(second.body.success).toBe(false);
  });

  // After revoking another session, the current session should still be valid and able to refresh
  test("revoking another session does not revoke the current session (current still refreshes)", async () => {
    await createUser({
      email: "not-current@example.com",
      password: "secret123",
    });

    const { agent: currentAgent } = await loginAgentAndSessionId({
      email: "not-current@example.com",
      password: "secret123",
    });

    const { agent: otherAgent, sessionId: otherSessionId } =
      await loginAgentAndSessionId({
        email: "not-current@example.com",
        password: "secret123",
      });

    // Revoke the other agent's session
    const res = await currentAgent.post(
      `/api/auth/sessions/${otherSessionId}/revoke`,
    );
    expect(res.status).toBe(200);

    // otherAgent should fail refresh (as you already test)
    const refreshOther = await otherAgent.post("/api/auth/refresh").send({});
    expect(refreshOther.status).toBe(401);

    // currentAgent should still be able to refresh
    const refreshCurrent = await currentAgent
      .post("/api/auth/refresh")
      .send({});
    expect(refreshCurrent.status).toBe(200);
    expect(refreshCurrent.body.success).toBe(true);
  });

  // The API should return 400 if the session ID is not a valid ObjectId
  test("invalid ObjectId sessionId returns 400", async () => {
    await createUser({
      email: "invalid-oid@example.com",
      password: "secret123",
    });

    const { agent } = await loginAgentAndSessionId({
      email: "invalid-oid@example.com",
      password: "secret123",
    });

    const res = await agent.post(`/api/auth/sessions/not-an-objectid/revoke`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
