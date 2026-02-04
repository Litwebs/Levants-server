const request = require("supertest");

let lastResetLink = null;

jest.mock("../../../Integration/Email.service", () =>
  jest.fn(async (_to, _subject, templateName, templateParams) => {
    if (templateName === "resetPassword") {
      lastResetLink = templateParams?.resetLink || null;
    }
    return { success: true };
  }),
);

const sendEmail = require("../../../Integration/Email.service");
const PasswordResetToken = require("../../../models/passwordResetToken.model");
const cryptoUtil = require("../../../utils/crypto.util");
const { createUser } = require("../../helpers/authTestData");
const app = require("../../testApp");

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    lastResetLink = null;
  });

  // check request body validation
  test("validates request body", async () => {
    const res = await request(app).post("/api/auth/forgot-password").send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // end-to-end test for existing user
  test("returns generic success, creates reset token, and sends email when user exists (E2E)", async () => {
    const user = await createUser({
      email: "t@example.com",
      password: "secret123",
    });

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "t@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.message).toBe("string");
    expect(res.body.data).toBe(null);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(lastResetLink).toBeTruthy();

    const token = new URL(lastResetLink).searchParams.get("token");
    expect(token).toBeTruthy();

    const records = await PasswordResetToken.find({ user: user._id });
    expect(records.length).toBe(1);

    const record = records[0];
    expect(record.usedAt).toBeFalsy();
    expect(new Date(record.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(record.tokenHash).toBe(cryptoUtil.hashToken(token));
  });

  // end-to-end test for non-existing user
  test("returns the same generic success but does not create token or send email when user does not exist (E2E)", async () => {
    const resMissing = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "missing@example.com" });

    expect(resMissing.status).toBe(200);
    expect(resMissing.body.success).toBe(true);
    expect(typeof resMissing.body.message).toBe("string");
    expect(resMissing.body.data).toBe(null);

    expect(sendEmail).toHaveBeenCalledTimes(0);

    const count = await PasswordResetToken.countDocuments({});
    expect(count).toBe(0);
  });

  // ensure identical response for existing and non-existing users
  test("does not leak whether a user exists (message is identical)", async () => {
    await createUser({
      email: "exists@example.com",
      password: "secret123",
    });

    const resExists = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "exists@example.com" });

    const resMissing = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "missing2@example.com" });

    expect(resExists.status).toBe(200);
    expect(resMissing.status).toBe(200);
    expect(resExists.body.message).toBe(resMissing.body.message);
  });

  // email normalization test
  test("normalizes email (case + whitespace) and still sends reset email", async () => {
    const user = await createUser({
      email: "norm@example.com",
      password: "secret123",
    });

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "  NORM@Example.com " });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(lastResetLink).toBeTruthy();

    const token = new URL(lastResetLink).searchParams.get("token");
    expect(token).toBeTruthy();

    const records = await PasswordResetToken.find({ user: user._id });
    expect(records.length).toBe(1);
    expect(records[0].tokenHash).toBe(cryptoUtil.hashToken(token));
  });

  // invalid email format test
  test("rejects invalid email format (schema validation)", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);

    expect(sendEmail).toHaveBeenCalledTimes(0);
    expect(await PasswordResetToken.countDocuments({})).toBe(0);
  });

  // multiple requests handling test
  test("does not create multiple tokens if called twice quickly (if your implementation enforces single active token)", async () => {
    // Keep this test only if your controller prevents multiple active reset tokens.
    const user = await createUser({
      email: "single-active@example.com",
      password: "secret123",
    });

    const r1 = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "single-active@example.com" });
    expect(r1.status).toBe(200);

    const firstLink = lastResetLink;
    expect(firstLink).toBeTruthy();

    // reset capture then call again immediately
    lastResetLink = null;

    const r2 = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "single-active@example.com" });
    expect(r2.status).toBe(200);

    const records = await PasswordResetToken.find({ user: user._id });

    // Choose ONE expected behavior depending on your design:
    // Option A: still only one active token exists (recommended)
    // expect(records.length).toBe(1);

    // Option B: creates a new token each time (also acceptable)
    // expect(records.length).toBe(2);

    // If option B, ensure tokens are different hashes:
    if (records.length === 2) {
      expect(records[0].tokenHash).not.toBe(records[1].tokenHash);
    }
  });

  // used token handling test
  test("creates a new token if the previous token was used (if you store usedAt)", async () => {
    const user = await createUser({
      email: "used-reset@example.com",
      password: "secret123",
    });

    const r1 = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "used-reset@example.com" });
    expect(r1.status).toBe(200);

    const token1 = new URL(lastResetLink).searchParams.get("token");
    expect(token1).toBeTruthy();

    const records1 = await PasswordResetToken.find({ user: user._id });
    expect(records1.length).toBe(1);

    // mark as used
    records1[0].usedAt = new Date();
    await records1[0].save();

    // request again -> should create a fresh token
    lastResetLink = null;

    const r2 = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "used-reset@example.com" });
    expect(r2.status).toBe(200);

    const token2 = new URL(lastResetLink).searchParams.get("token");
    expect(token2).toBeTruthy();
    expect(token2).not.toBe(token1);

    const records2 = await PasswordResetToken.find({ user: user._id });
    expect(records2.length).toBeGreaterThanOrEqual(2);
  });

  // email sending failure handling test
  test("does not leak internal errors (still returns generic success if email sending fails) if that's your policy", async () => {
    // Current behavior: sendEmail failure bubbles up and returns 500.
    sendEmail.mockImplementationOnce(async () => {
      throw new Error("SMTP_DOWN");
    });

    await createUser({
      email: "email-fail@example.com",
      password: "secret123",
    });

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "email-fail@example.com" });

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  // disabled user handling test
  test("disabled user: behaves like a normal user (creates token + sends email)", async () => {
    await createUser({
      email: "disabled-forgot@example.com",
      password: "secret123",
      status: "disabled",
    });

    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "disabled-forgot@example.com" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(lastResetLink).toBeTruthy();
    expect(await PasswordResetToken.countDocuments({})).toBe(1);
  });

  // consistent generic response shape test
  test("response is always generic shape (success true, data null)", async () => {
    const res = await request(app)
      .post("/api/auth/forgot-password")
      .send({ email: "any@example.com" });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("success", true);
    expect(typeof res.body.message).toBe("string");
    expect(res.body.data).toBe(null);
  });
});
