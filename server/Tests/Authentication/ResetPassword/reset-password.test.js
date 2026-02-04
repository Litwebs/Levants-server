const request = require("supertest");

const mongoose = require("mongoose");

const PasswordResetToken = require("../../../models/passwordResetToken.model");
const Session = require("../../../models/session.model");
const User = require("../../../models/user.model");
const cryptoUtil = require("../../../utils/crypto.util");
const passwordUtil = require("../../../utils/password.util");
const { createUser } = require("../../helpers/authTestData");
const app = require("../../testApp");

describe("POST /api/auth/reset-password (E2E)", () => {
  // test for request body validation
  test("validates request body", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // test for successful password reset
  test("resets password, marks token used, and blocks reuse", async () => {
    const user = await createUser({
      email: "reset-ok@example.com",
      password: "oldpass123",
    });

    const rawToken = "raw_reset_token_for_reset_ok";

    const rec = await PasswordResetToken.create({
      user: user._id,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await request(app).post("/api/auth/reset-password").send({
      token: rawToken,
      newPassword: "newpass123",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.message).toBe("string");
    expect(res.body.data).toBe(null);

    const freshUser = await User.findById(user._id).select("+passwordHash");
    expect(freshUser).toBeTruthy();
    expect(
      await passwordUtil.verifyPassword("newpass123", freshUser.passwordHash),
    ).toBe(true);
    expect(
      await passwordUtil.verifyPassword("oldpass123", freshUser.passwordHash),
    ).toBe(false);

    const used = await PasswordResetToken.findById(rec._id);
    expect(used.usedAt).toBeTruthy();

    // Reuse same token should fail
    const reuse = await request(app).post("/api/auth/reset-password").send({
      token: rawToken,
      newPassword: "anotherpass123",
    });
    expect(reuse.status).toBe(400);
    expect(reuse.body.success).toBe(false);
  });

  test("revokes all existing sessions after password reset", async () => {
    const user = await createUser({
      email: "reset-revoke-sessions@example.com",
      password: "oldpass123",
    });

    const rawToken = "raw_reset_token_revoke_sessions";

    await PasswordResetToken.create({
      user: user._id,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const active1 = await Session.create({
      user: user._id,
      refreshTokenHash: "hash1",
      userAgent: "jest",
      ip: "127.0.0.1",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const active2 = await Session.create({
      user: user._id,
      refreshTokenHash: "hash2",
      userAgent: "jest",
      ip: "127.0.0.1",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const alreadyRevoked = await Session.create({
      user: user._id,
      refreshTokenHash: "hash3",
      userAgent: "jest",
      ip: "127.0.0.1",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      revokedAt: new Date(Date.now() - 60 * 1000),
      revokedReason: "USER_REVOKE",
    });

    const res = await request(app).post("/api/auth/reset-password").send({
      token: rawToken,
      newPassword: "newpass123",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const s1 = await Session.findById(active1._id);
    const s2 = await Session.findById(active2._id);
    const s3 = await Session.findById(alreadyRevoked._id);

    expect(s1.revokedAt).toBeTruthy();
    expect(s1.revokedReason).toBe("PASSWORD_RESET");
    expect(s2.revokedAt).toBeTruthy();
    expect(s2.revokedReason).toBe("PASSWORD_RESET");

    // previously revoked sessions should remain untouched
    expect(s3.revokedAt).toBeTruthy();
    expect(s3.revokedReason).toBe("USER_REVOKE");
  });

  // test for invalid token
  test("returns 400 for invalid token", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({
      token: "invalid_token_value_12345",
      newPassword: "newpass123",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // test for expired token
  test("returns 400 for expired token", async () => {
    const user = await createUser({
      email: "reset-expired@example.com",
      password: "oldpass123",
    });

    const rawToken = "raw_reset_token_for_reset_expired";

    await PasswordResetToken.create({
      user: user._id,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    const res = await request(app).post("/api/auth/reset-password").send({
      token: rawToken,
      newPassword: "newpass123",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // test for missing user
  test("maps USER_NOT_FOUND to 404 when token is valid but user is missing", async () => {
    const rawToken = "raw_reset_token_user_missing";
    const missingUserId = new mongoose.Types.ObjectId();

    await PasswordResetToken.create({
      user: missingUserId,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await request(app).post("/api/auth/reset-password").send({
      token: rawToken,
      newPassword: "newpass123",
    });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  // test for already used token
  test("returns 400 when token is already used", async () => {
    const user = await createUser({
      email: "reset-used@example.com",
      password: "oldpass123",
    });

    const rawToken = "raw_reset_token_already_used";

    await PasswordResetToken.create({
      user: user._id,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      usedAt: new Date(),
    });

    const res = await request(app).post("/api/auth/reset-password").send({
      token: rawToken,
      newPassword: "newpass123",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);

    // password should not change
    const freshUser = await User.findById(user._id).select("+passwordHash");
    expect(
      await passwordUtil.verifyPassword("oldpass123", freshUser.passwordHash),
    ).toBe(true);
  });

  // test for whitespace in token
  test("trims token (leading/trailing whitespace is tolerated)", async () => {
    const user = await createUser({
      email: "reset-ws@example.com",
      password: "oldpass123",
    });

    const rawToken = "raw_reset_token_ws_reset";

    await PasswordResetToken.create({
      user: user._id,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await request(app)
      .post("/api/auth/reset-password")
      .send({
        token: ` ${rawToken} `,
        newPassword: "newpass123",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBe(null);

    // password should change
    const freshUser = await User.findById(user._id).select("+passwordHash");
    expect(
      await passwordUtil.verifyPassword("oldpass123", freshUser.passwordHash),
    ).toBe(false);
    expect(
      await passwordUtil.verifyPassword("newpass123", freshUser.passwordHash),
    ).toBe(true);
  });

  test("does not accept token with internal whitespace", async () => {
    const user = await createUser({
      email: "reset-ws-internal@example.com",
      password: "oldpass123",
    });

    const rawToken = "raw_reset_token_ws_internal";

    await PasswordResetToken.create({
      user: user._id,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await request(app).post("/api/auth/reset-password").send({
      token: "raw_reset_token ws_internal",
      newPassword: "newpass123",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);

    // password should not change
    const freshUser = await User.findById(user._id).select("+passwordHash");
    expect(
      await passwordUtil.verifyPassword("oldpass123", freshUser.passwordHash),
    ).toBe(true);
  });

  // test for case sensitivity in token
  test("token is case-sensitive (different casing is invalid)", async () => {
    const user = await createUser({
      email: "reset-case@example.com",
      password: "oldpass123",
    });

    const rawToken = "Raw_Reset_Token_Case_Sensitive_ABC";

    await PasswordResetToken.create({
      user: user._id,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await request(app).post("/api/auth/reset-password").send({
      token: rawToken.toLowerCase(), // different string => different hash
      newPassword: "newpass123",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // test for password policy enforcement
  test("rejects too-short newPassword (if validator enforces policy)", async () => {
    // keep this only if resetPasswordSchema enforces min length
    const user = await createUser({
      email: "reset-policy@example.com",
      password: "oldpass123",
    });

    const rawToken = "raw_reset_token_policy";

    await PasswordResetToken.create({
      user: user._id,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await request(app).post("/api/auth/reset-password").send({
      token: rawToken,
      newPassword: "123", // intentionally too short
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);

    const freshUser = await User.findById(user._id).select("+passwordHash");
    expect(
      await passwordUtil.verifyPassword("oldpass123", freshUser.passwordHash),
    ).toBe(true);
  });

  // test that no session is created on password reset
  test("does not set auth cookies or create a session on password reset", async () => {
    const user = await createUser({
      email: "reset-no-session@example.com",
      password: "oldpass123",
    });

    const rawToken = "raw_reset_token_no_session";

    await PasswordResetToken.create({
      user: user._id,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await request(app).post("/api/auth/reset-password").send({
      token: rawToken,
      newPassword: "newpass123",
    });

    expect(res.status).toBe(200);

    // should not log the user in automatically
    const setCookie = res.headers["set-cookie"] || [];
    expect(setCookie.join("\n")).not.toContain("accessToken=");
    expect(setCookie.join("\n")).not.toContain("refreshToken=");
  });

  // test for empty token
  test("does not allow resetting with empty token", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({
      token: "",
      newPassword: "newpass123",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // test for empty newPassword
  test("does not allow resetting with empty newPassword", async () => {
    const res = await request(app).post("/api/auth/reset-password").send({
      token: "some-token",
      newPassword: "",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // test that only the token owner user password is changed (other users unaffected)
  test("only the token owner user password is changed (other users unaffected)", async () => {
    const userA = await createUser({
      email: "reset-owner-a@example.com",
      password: "oldpass123",
    });
    const userB = await createUser({
      email: "reset-owner-b@example.com",
      password: "bpass123",
    });

    const rawToken = "raw_reset_token_owner_a";

    await PasswordResetToken.create({
      user: userA._id,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await request(app).post("/api/auth/reset-password").send({
      token: rawToken,
      newPassword: "newpass123",
    });

    expect(res.status).toBe(200);

    const freshA = await User.findById(userA._id).select("+passwordHash");
    const freshB = await User.findById(userB._id).select("+passwordHash");

    expect(
      await passwordUtil.verifyPassword("newpass123", freshA.passwordHash),
    ).toBe(true);
    expect(
      await passwordUtil.verifyPassword("oldpass123", freshA.passwordHash),
    ).toBe(false);

    // userB should be unchanged
    expect(
      await passwordUtil.verifyPassword("bpass123", freshB.passwordHash),
    ).toBe(true);
  });
});
