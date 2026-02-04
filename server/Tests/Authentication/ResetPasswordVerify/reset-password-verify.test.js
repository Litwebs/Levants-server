const request = require("supertest");

const PasswordResetToken = require("../../../models/passwordResetToken.model");
const cryptoUtil = require("../../../utils/crypto.util");
const { TOKEN_REQUIRED } = require("../../../constants/Auth.constants");
const { createUser } = require("../../helpers/authTestData");
const app = require("../../testApp");

describe("GET /api/auth/reset-password/verify (E2E)", () => {
  // check missing token
  test("requires token query param", async () => {
    const res = await request(app).get("/api/auth/reset-password/verify");

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toBe(TOKEN_REQUIRED);
    expect(res.body.data).toBe(null);
  });

  // check valid token
  test("returns 200 when token is valid", async () => {
    const user = await createUser({
      email: "verify-ok@example.com",
      password: "secret123",
    });

    const rawToken = "raw_reset_token_ok";

    await PasswordResetToken.create({
      user: user._id,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await request(app)
      .get("/api/auth/reset-password/verify")
      .query({ token: rawToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.message).toBe("string");
    expect(res.body.data).toBe(null);
  });

  // check invalid, expired, and used tokens
  test("returns 400 when token is invalid", async () => {
    const res = await request(app)
      .get("/api/auth/reset-password/verify")
      .query({ token: "definitely-not-valid" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toEqual({ valid: false });
  });

  // check expired token
  test("returns 400 when token is expired", async () => {
    const user = await createUser({
      email: "verify-expired@example.com",
      password: "secret123",
    });

    const rawToken = "raw_reset_token_expired";

    await PasswordResetToken.create({
      user: user._id,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() - 5 * 60 * 1000),
    });

    const res = await request(app)
      .get("/api/auth/reset-password/verify")
      .query({ token: rawToken });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toEqual({ valid: false });
  });

  // check used token
  test("returns 400 when token is already used", async () => {
    const user = await createUser({
      email: "verify-used@example.com",
      password: "secret123",
    });

    const rawToken = "raw_reset_token_used";

    await PasswordResetToken.create({
      user: user._id,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      usedAt: new Date(),
    });

    const res = await request(app)
      .get("/api/auth/reset-password/verify")
      .query({ token: rawToken });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toEqual({ valid: false });
  });

  test("treats whitespace around token as invalid (no trimming)", async () => {
    const user = await createUser({
      email: "verify-ws@example.com",
      password: "secret123",
    });

    const rawToken = "raw_reset_token_ws";

    await PasswordResetToken.create({
      user: user._id,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await request(app)
      .get("/api/auth/reset-password/verify")
      .query({ token: ` ${rawToken} ` });

    // service hashes token as-is; spaces change hash -> invalid
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toEqual({ valid: false });
  });

  test("is case-sensitive (different token casing is invalid)", async () => {
    const user = await createUser({
      email: "verify-case@example.com",
      password: "secret123",
    });

    const rawToken = "raw_reset_token_CASE_sensitive";

    await PasswordResetToken.create({
      user: user._id,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await request(app)
      .get("/api/auth/reset-password/verify")
      .query({ token: rawToken.toLowerCase() });

    // different string => different hash => invalid
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.data).toEqual({ valid: false });
  });

  test("returns 400 when token is empty string", async () => {
    const res = await request(app)
      .get("/api/auth/reset-password/verify")
      .query({ token: "" });

    // controller/schema may treat this as missing token or invalid token
    expect([400]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  test("returns 400 when token is an array (token=one&token=two)", async () => {
    // express parses repeated query params into arrays in some configs
    const res = await request(app)
      .get("/api/auth/reset-password/verify")
      .query({ token: ["one", "two"] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test("valid token returns data:null (controller does not forward {valid:true})", async () => {
    const user = await createUser({
      email: "verify-data-null@example.com",
      password: "secret123",
    });

    const rawToken = "raw_reset_token_data_null";

    await PasswordResetToken.create({
      user: user._id,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const res = await request(app)
      .get("/api/auth/reset-password/verify")
      .query({ token: rawToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBe(null);
  });

  test("does not leak whether token exists (expired vs invalid look the same)", async () => {
    const user = await createUser({
      email: "verify-leak@example.com",
      password: "secret123",
    });

    const rawToken = "raw_reset_token_for_expired";

    await PasswordResetToken.create({
      user: user._id,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() - 60 * 1000),
    });

    const expiredRes = await request(app)
      .get("/api/auth/reset-password/verify")
      .query({ token: rawToken });

    const invalidRes = await request(app)
      .get("/api/auth/reset-password/verify")
      .query({ token: "some-invalid-token" });

    expect(expiredRes.status).toBe(400);
    expect(invalidRes.status).toBe(400);

    // If your API standardizes message, assert they're identical:
    if (expiredRes.body?.message && invalidRes.body?.message) {
      expect(expiredRes.body.message).toBe(invalidRes.body.message);
    }

    // both should just say valid:false in data (based on your service)
    expect(expiredRes.body.data).toEqual({ valid: false });
    expect(invalidRes.body.data).toEqual({ valid: false });
  });

  test("valid token stays valid until marked used (verify does not consume it)", async () => {
    const user = await createUser({
      email: "verify-not-consume@example.com",
      password: "secret123",
    });

    const rawToken = "raw_reset_token_not_consumed";

    const rec = await PasswordResetToken.create({
      user: user._id,
      tokenHash: cryptoUtil.hashToken(rawToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const first = await request(app)
      .get("/api/auth/reset-password/verify")
      .query({ token: rawToken });

    expect(first.status).toBe(200);
    expect(first.body.success).toBe(true);

    const still = await PasswordResetToken.findById(rec._id);
    expect(still.usedAt).toBeFalsy(); // verify shouldn't mark used

    const second = await request(app)
      .get("/api/auth/reset-password/verify")
      .query({ token: rawToken });

    expect(second.status).toBe(200);
    expect(second.body.success).toBe(true);
  });
});
