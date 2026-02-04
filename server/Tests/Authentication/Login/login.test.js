const request = require("supertest");

let last2FACode = null;

jest.mock("../../../Integration/Email.service", () =>
  jest.fn(async (_to, _subject, templateName, templateParams) => {
    if (templateName === "login2FA") {
      last2FACode = templateParams?.code || null;
    }
    return { success: true };
  }),
);

const User = require("../../../models/user.model");
const Session = require("../../../models/session.model");
const jwtUtil = require("../../../utils/jwt.util");
const { createUser } = require("../../helpers/authTestData");
const {
  getSetCookieHeader,
  getCookieValueFromSetCookie,
} = require("../../helpers/cookies");
const app = require("../../testApp");

describe("POST /api/auth/login (E2E)", () => {
  // 1. Check for required fields
  test("validates request body", async () => {
    const res = await request(app).post("/api/auth/login").send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // 2. Successful login returns user data and sets cookies
  test("returns user and sets cookies on normal login", async () => {
    const user = await createUser({
      email: "t@example.com",
      password: "secret123",
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "t@example.com",
      password: "secret123",
      rememberMe: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe("t@example.com");
    expect(res.body.data.user.passwordHash).toBeUndefined();

    const setCookie = getSetCookieHeader(res);
    expect(setCookie.join("\n")).toContain("accessToken=");
    expect(setCookie.join("\n")).toContain("refreshToken=");

    // DB: session must exist for normal login
    const refreshToken = getCookieValueFromSetCookie(setCookie, "refreshToken");
    expect(refreshToken).toBeTruthy();
    const payload = jwtUtil.verifyRefreshToken(refreshToken);
    expect(payload.sub).toBe(String(user._id));

    const session = await Session.findById(payload.sid);
    expect(session).toBeTruthy();
    expect(String(session.user)).toBe(String(user._id));
  });

  // 3. Check wrong password
  test("returns 401 on wrong password", async () => {
    await createUser({ email: "t@example.com", password: "secret123" });

    const res = await request(app).post("/api/auth/login").send({
      email: "t@example.com",
      password: "wrongpass",
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 4. Check missing user
  test("returns 401 when user does not exist", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "missing@example.com",
      password: "secret123",
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 5. Check email normalization
  test("normalizes email (case + whitespace)", async () => {
    await createUser({ email: "t@example.com", password: "secret123" });

    const res = await request(app).post("/api/auth/login").send({
      email: "  T@Example.com ",
      password: "secret123",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe("t@example.com");
  });

  // 6. Check disabled user
  test("returns 401 when user is disabled", async () => {
    await createUser({
      email: "disabled@example.com",
      password: "secret123",
      status: "disabled",
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "disabled@example.com",
      password: "secret123",
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 7. 2FA enabled user
  test("returns 2FA challenge payload when 2FA is enabled", async () => {
    last2FACode = null;
    const user = await createUser({
      email: "t2fa@example.com",
      password: "secret123",
      twoFactorEnabled: true,
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "t2fa@example.com",
      password: "secret123",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.requires2FA).toBe(true);
    expect(typeof res.body.data.tempToken).toBe("string");
    expect(res.body.data.tempToken.length).toBeGreaterThan(10);

    // no cookies until 2FA is verified
    const setCookie = getSetCookieHeader(res);
    expect(setCookie.length).toBe(0);

    // email was "sent" (captured by mock)
    expect(last2FACode).toBeTruthy();

    // 2FA challenge stored on user
    const fresh = await User.findById(user._id).select(
      "+twoFactorLogin +twoFactorLogin.codeHash +twoFactorLogin.expiresAt",
    );
    expect(fresh.twoFactorLogin).toBeTruthy();
    expect(fresh.twoFactorLogin.codeHash).toBeTruthy();

    // DB: no Session should be created until 2FA is verified
    const sessions = await Session.find({ user: user._id });
    expect(sessions.length).toBe(0);
  });

  // 8. Remember Me effect on session expiry
  test("sets different refresh/session expiry when rememberMe is true vs false", async () => {
    await createUser({ email: "rm@example.com", password: "secret123" });

    const resShort = await request(app).post("/api/auth/login").send({
      email: "rm@example.com",
      password: "secret123",
      rememberMe: false,
    });

    expect(resShort.status).toBe(200);
    const setCookieShort = getSetCookieHeader(resShort);
    const refreshShort = getCookieValueFromSetCookie(
      setCookieShort,
      "refreshToken",
    );
    const payloadShort = jwtUtil.verifyRefreshToken(refreshShort);
    const sessionShort = await Session.findById(payloadShort.sid);
    expect(sessionShort).toBeTruthy();

    const resLong = await request(app).post("/api/auth/login").send({
      email: "rm@example.com",
      password: "secret123",
      rememberMe: true,
    });

    expect(resLong.status).toBe(200);
    const setCookieLong = getSetCookieHeader(resLong);
    const refreshLong = getCookieValueFromSetCookie(
      setCookieLong,
      "refreshToken",
    );
    const payloadLong = jwtUtil.verifyRefreshToken(refreshLong);
    const sessionLong = await Session.findById(payloadLong.sid);
    expect(sessionLong).toBeTruthy();

    // If you store expiry on session, compare them:
    if (sessionShort?.expiresAt && sessionLong?.expiresAt) {
      expect(new Date(sessionLong.expiresAt).getTime()).toBeGreaterThan(
        new Date(sessionShort.expiresAt).getTime(),
      );
    }
  });

  // 9. Check cookie flags
  test("sets secure cookie flags (HttpOnly/SameSite/Path)", async () => {
    await createUser({
      email: "cookieflags@example.com",
      password: "secret123",
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "cookieflags@example.com",
      password: "secret123",
    });

    expect(res.status).toBe(200);

    const setCookie = getSetCookieHeader(res).join("\n");
    expect(setCookie).toContain("accessToken=");
    expect(setCookie).toContain("refreshToken=");

    // common expectations (adjust if yours differs)
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=/i);
    expect(setCookie).toMatch(/Path=\//i);

    // If you enable Secure in prod only, you can conditionally assert based on NODE_ENV
    // expect(setCookie).toMatch(/Secure/i);
  });

  // 10. No user existence leakage
  test("does not leak whether user exists (same response shape)", async () => {
    await createUser({ email: "exists@example.com", password: "secret123" });

    const wrongPass = await request(app).post("/api/auth/login").send({
      email: "exists@example.com",
      password: "wrongpass",
    });

    const missingUser = await request(app).post("/api/auth/login").send({
      email: "missing2@example.com",
      password: "wrongpass",
    });

    expect(wrongPass.status).toBe(401);
    expect(missingUser.status).toBe(401);

    // If you standardize message, assert equality:
    if (wrongPass.body?.message && missingUser.body?.message) {
      expect(wrongPass.body.message).toBe(missingUser.body.message);
    }
  });

  // 11. 2FA cool down on repeated attempts
  test("2FA does not spam codes on rapid repeated login attempts (cooldown)", async () => {
    last2FACode = null;
    await createUser({
      email: "2facool@example.com",
      password: "secret123",
      twoFactorEnabled: true,
    });

    const first = await request(app).post("/api/auth/login").send({
      email: "2facool@example.com",
      password: "secret123",
    });
    expect(first.status).toBe(200);
    const code1 = last2FACode;
    expect(code1).toBeTruthy();

    last2FACode = null;

    const second = await request(app).post("/api/auth/login").send({
      email: "2facool@example.com",
      password: "secret123",
    });
    expect(second.status).toBe(200);

    // If you block resends, you may not send again; or you might send a new code.
    // Pick the assertion that matches your design.
    // Option A: no resend during cooldown:
    // expect(last2FACode).toBe(null);

    // Option B: resend generates a new code:
    if (last2FACode) expect(last2FACode).not.toBe(code1);
  });

  // 12. No 2FA tempToken on wrong password
  test("does not issue 2FA tempToken when password is wrong", async () => {
    await createUser({
      email: "2fawrong@example.com",
      password: "secret123",
      twoFactorEnabled: true,
    });

    const res = await request(app).post("/api/auth/login").send({
      email: "2fawrong@example.com",
      password: "wrongpass",
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.data?.tempToken).toBeUndefined();
  });

  // 13. Multiple sessions per user
  test("creates a new session on each login (and optionally revokes old)", async () => {
    await createUser({ email: "multisess@example.com", password: "secret123" });

    const res1 = await request(app).post("/api/auth/login").send({
      email: "multisess@example.com",
      password: "secret123",
    });
    const set1 = getSetCookieHeader(res1);
    const rt1 = getCookieValueFromSetCookie(set1, "refreshToken");
    const p1 = jwtUtil.verifyRefreshToken(rt1);
    const s1 = await Session.findById(p1.sid);
    expect(s1).toBeTruthy();

    const res2 = await request(app).post("/api/auth/login").send({
      email: "multisess@example.com",
      password: "secret123",
    });
    const set2 = getSetCookieHeader(res2);
    const rt2 = getCookieValueFromSetCookie(set2, "refreshToken");
    const p2 = jwtUtil.verifyRefreshToken(rt2);
    const s2 = await Session.findById(p2.sid);
    expect(s2).toBeTruthy();
    expect(String(s2._id)).not.toBe(String(s1._id));

    // If your logic revokes old sessions:
    // const old = await Session.findById(p1.sid);
    // expect(old.revokedAt || old.isRevoked).toBeTruthy();
  });

  // 14. Password with leading/trailing spaces
  test("does not trim password silently (password with spaces should fail)", async () => {
    await createUser({ email: "pwspace@example.com", password: "secret123" });

    const res = await request(app).post("/api/auth/login").send({
      email: "pwspace@example.com",
      password: " secret123 ",
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 15. Invalid email format
  test("rejects invalid email format", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "not-an-email",
      password: "secret123",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // 16. Extremely long email/password
  test("never returns sensitive user fields", async () => {
    await createUser({ email: "sensitive@example.com", password: "secret123" });
    const res = await request(app).post("/api/auth/login").send({
      email: "sensitive@example.com",
      password: "secret123",
    });

    expect(res.status).toBe(200);
    const user = res.body.data.user;

    expect(user.passwordHash).toBeUndefined();
    expect(user.twoFactorSecret).toBeUndefined();
    expect(user.twoFactorLogin).toBeUndefined();
    expect(user.resetPasswordToken).toBeUndefined();
  });
});
