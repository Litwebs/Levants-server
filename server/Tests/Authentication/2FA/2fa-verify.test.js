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

const Session = require("../../../models/session.model");
const jwtUtil = require("../../../utils/jwt.util");
const { createUser } = require("../../helpers/authTestData");
const {
  getSetCookieHeader,
  getCookieValueFromSetCookie,
} = require("../../helpers/cookies");
const app = require("../../testApp");

describe("POST /api/auth/2fa/verify (E2E)", () => {
  test("validates request body", async () => {
    const res = await request(app).post("/api/auth/2fa/verify").send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("sets cookies and returns user when verification succeeds", async () => {
    last2FACode = null;

    const user = await createUser({
      email: "t2fa-verify@example.com",
      password: "secret123",
      twoFactorEnabled: true,
    });

    // Step 1: login triggers 2FA challenge (no cookies yet)
    const loginRes = await request(app).post("/api/auth/login").send({
      email: "t2fa-verify@example.com",
      password: "secret123",
      rememberMe: true,
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.data.requires2FA).toBe(true);
    expect(typeof loginRes.body.data.tempToken).toBe("string");
    expect(last2FACode).toBeTruthy();

    const tempToken = loginRes.body.data.tempToken;

    // Step 2: verify 2FA issues real tokens + session
    const res = await request(app).post("/api/auth/2fa/verify").send({
      tempToken,
      code: last2FACode,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe("t2fa-verify@example.com");
    expect(String(res.body.data.user.id)).toBe(String(user._id));

    const setCookie = getSetCookieHeader(res);
    expect(setCookie.join("\n")).toContain("accessToken=");
    expect(setCookie.join("\n")).toContain("refreshToken=");

    const refreshToken = getCookieValueFromSetCookie(setCookie, "refreshToken");
    const payload = jwtUtil.verifyRefreshToken(refreshToken);
    expect(payload.sub).toBe(String(user._id));
    expect(payload.sid).toBeTruthy();

    const session = await Session.findById(payload.sid);
    expect(session).toBeTruthy();
    expect(String(session.user)).toBe(String(user._id));
  });

  test("returns 401 on wrong 2FA code", async () => {
    last2FACode = null;

    await createUser({
      email: "t2fa-wrong@example.com",
      password: "secret123",
      twoFactorEnabled: true,
    });

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "t2fa-wrong@example.com",
      password: "secret123",
    });

    expect(loginRes.status).toBe(200);
    const tempToken = loginRes.body.data.tempToken;
    expect(tempToken).toBeTruthy();

    const res = await request(app).post("/api/auth/2fa/verify").send({
      tempToken,
      code: "000000",
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("does not set cookies when verification fails (wrong code)", async () => {
    last2FACode = null;

    await createUser({
      email: "t2fa-nocookies@example.com",
      password: "secret123",
      twoFactorEnabled: true,
    });

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "t2fa-nocookies@example.com",
      password: "secret123",
    });

    const tempToken = loginRes.body.data.tempToken;

    const res = await request(app).post("/api/auth/2fa/verify").send({
      tempToken,
      code: "000000",
    });

    expect(res.status).toBe(401);
    const setCookie = getSetCookieHeader(res);
    expect(setCookie.length).toBe(0);
  });

  test("returns 401 when tempToken is invalid", async () => {
    const res = await request(app).post("/api/auth/2fa/verify").send({
      tempToken: "not-a-valid-jwt",
      code: "123456",
    });

    // your Verify2FA returns INVALID_OR_EXPIRED_SESSION => controller usually maps to 401
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("returns 401 when user is deleted after tempToken is issued", async () => {
    last2FACode = null;

    const user = await createUser({
      email: "t2fa-deleted@example.com",
      password: "secret123",
      twoFactorEnabled: true,
    });

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "t2fa-deleted@example.com",
      password: "secret123",
    });

    const tempToken = loginRes.body.data.tempToken;
    expect(tempToken).toBeTruthy();
    expect(last2FACode).toBeTruthy();

    await require("../../../models/user.model").deleteOne({ _id: user._id });

    const res = await request(app).post("/api/auth/2fa/verify").send({
      tempToken,
      code: last2FACode,
    });

    // service returns USER_NOT_FOUND; controller often maps to 401 for authy endpoints
    expect([401, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  test("returns 401/403 when user is disabled after tempToken is issued", async () => {
    last2FACode = null;

    const User = require("../../../models/user.model");

    const user = await createUser({
      email: "t2fa-disabled@example.com",
      password: "secret123",
      twoFactorEnabled: true,
      status: "active",
    });

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "t2fa-disabled@example.com",
      password: "secret123",
    });

    const tempToken = loginRes.body.data.tempToken;
    expect(tempToken).toBeTruthy();
    expect(last2FACode).toBeTruthy();

    await User.findByIdAndUpdate(user._id, { status: "disabled" });

    const res = await request(app).post("/api/auth/2fa/verify").send({
      tempToken,
      code: last2FACode,
    });

    // your Verify2FA returns USER_NOT_FOUND when disabled; mapping can vary
    expect([401, 403, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  test("returns 401 when 2FA challenge is expired (expiresAt passed)", async () => {
    last2FACode = null;

    const User = require("../../../models/user.model");

    const user = await createUser({
      email: "t2fa-expired@example.com",
      password: "secret123",
      twoFactorEnabled: true,
    });

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "t2fa-expired@example.com",
      password: "secret123",
    });

    const tempToken = loginRes.body.data.tempToken;
    expect(last2FACode).toBeTruthy();

    // Force expiry in DB
    await User.updateOne(
      { _id: user._id },
      { $set: { "twoFactorLogin.expiresAt": new Date(Date.now() - 1000) } },
    );

    const res = await request(app).post("/api/auth/2fa/verify").send({
      tempToken,
      code: last2FACode,
    });

    // service returns INVALID_CODE when expired
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);

    // Should not set cookies
    expect(getSetCookieHeader(res).length).toBe(0);

    // Optional: the service clears twoFactorLogin on expiry; verify it cleared
    const fresh = await User.findById(user._id).select("+twoFactorLogin");
    expect(fresh.twoFactorLogin).toBeFalsy();
  });

  test("returns 401 when no active 2FA session exists (twoFactorLogin cleared)", async () => {
    last2FACode = null;

    const User = require("../../../models/user.model");

    const user = await createUser({
      email: "t2fa-noactive@example.com",
      password: "secret123",
      twoFactorEnabled: true,
    });

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "t2fa-noactive@example.com",
      password: "secret123",
    });

    const tempToken = loginRes.body.data.tempToken;
    expect(last2FACode).toBeTruthy();

    // Remove challenge from DB
    await User.updateOne({ _id: user._id }, { $unset: { twoFactorLogin: 1 } });

    const res = await request(app).post("/api/auth/2fa/verify").send({
      tempToken,
      code: last2FACode,
    });

    // service returns NO_ACTIVE_2FA_SESSION
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  test("blocks reuse of the same 2FA challenge (second verify fails)", async () => {
    last2FACode = null;

    await createUser({
      email: "t2fa-reuse@example.com",
      password: "secret123",
      twoFactorEnabled: true,
    });

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "t2fa-reuse@example.com",
      password: "secret123",
    });

    const tempToken = loginRes.body.data.tempToken;
    const code = last2FACode;
    expect(code).toBeTruthy();

    const ok = await request(app).post("/api/auth/2fa/verify").send({
      tempToken,
      code,
    });

    expect(ok.status).toBe(200);
    expect(ok.body.success).toBe(true);

    // Try verify again with same token+code
    const again = await request(app).post("/api/auth/2fa/verify").send({
      tempToken,
      code,
    });

    // After success you set twoFactorLogin = undefined, so this becomes NO_ACTIVE_2FA_SESSION
    expect(again.status).toBe(401);
    expect(again.body.success).toBe(false);
  });

  test("locks after max attempts (6 wrong codes) then returns 401", async () => {
    last2FACode = null;

    await createUser({
      email: "t2fa-maxattempts@example.com",
      password: "secret123",
      twoFactorEnabled: true,
    });

    const loginRes = await request(app).post("/api/auth/login").send({
      email: "t2fa-maxattempts@example.com",
      password: "secret123",
    });

    const tempToken = loginRes.body.data.tempToken;
    expect(tempToken).toBeTruthy();

    let last = null;
    for (let i = 0; i < 6; i++) {
      last = await request(app).post("/api/auth/2fa/verify").send({
        tempToken,
        code: "000000",
      });
      expect(last.status).toBe(401);
    }

    // one more should hit TOO_MANY_ATTEMPTS (service checks attempts >= maxAttempts)
    const blocked = await request(app).post("/api/auth/2fa/verify").send({
      tempToken,
      code: "000000",
    });

    expect(blocked.status).toBe(401);
    expect(blocked.body.success).toBe(false);
  });
});
