"use strict";

const mongoose = require("mongoose");
const crypto = require("crypto");
const Customer = require("../../models/customer.model");
const Session = require("../../models/session.model");
const passwordUtil = require("../../utils/password.util");
const jwtUtil = require("../../utils/jwt.util");
const cryptoUtil = require("../../utils/crypto.util");
const sendEmail = require("../../Integration/Email.service");
const { Response } = require("../../utils/response.util");

const PORTAL_COOKIE_NAME = "customerAccessToken";
const PORTAL_REFRESH_COOKIE_NAME = "customerRefreshToken";
const SESSION_USER_TYPE = "customer";
const EMAIL_VERIFICATION_TTL_MINUTES = 10;
const EMAIL_CHANGE_TOKEN_TTL_MINUTES = 60;
const CUSTOMER_SESSION_DAYS = Number(process.env.CUSTOMER_SESSION_DAYS || 30);

function getCustomerPortalBaseUrl() {
  const env = process.env.NODE_ENV;
  const base =
    env === "production"
      ? process.env.CUSTOMER_PORTAL_URL_PROD ||
        process.env.CLIENT_FRONT_URL_PROD ||
        process.env.FRONTEND_URL_PROD
      : process.env.CUSTOMER_PORTAL_URL_DEV ||
        process.env.CLIENT_FRONT_URL_DEV ||
        process.env.FRONTEND_URL_DEV ||
        "http://localhost:8080";

  return String(base || "").replace(/\/$/, "");
}

function buildCustomerEmailChangeConfirmLink(userId, token) {
  const base = getCustomerPortalBaseUrl();
  if (!base) return "";
  return `${base}/confirm-email-change?userId=${userId}&token=${token}`;
}

function generateSixDigitCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function setAndSendVerificationCode(customer, reason = "registration") {
  const code = generateSixDigitCode();
  customer.emailVerificationCodeHash = cryptoUtil.hashToken(code);
  customer.emailVerificationCodeExpiresAt = new Date(
    Date.now() + EMAIL_VERIFICATION_TTL_MINUTES * 60 * 1000,
  );
  await customer.save();

  try {
    const emailResult = await sendEmail(
      customer.email,
      "Your Levants Dairy verification code",
      "login2FA",
      {
        name: customer.firstName,
        code,
        expiresMinutes: EMAIL_VERIFICATION_TTL_MINUTES,
      },
    );

    if (!emailResult?.success) {
      const reasonText =
        emailResult?.error?.message || "Unknown provider error";
      console.error(
        `[CustomerAuth] Failed to send ${reason} verification code: ${reasonText}`,
      );
    }
  } catch (err) {
    console.error(
      `[CustomerAuth] Failed to send ${reason} verification code:`,
      err.message,
    );
  }
}

function buildCookieOptions({
  rememberMe = false,
  refreshCookie = false,
} = {}) {
  const isProduction = process.env.NODE_ENV === "production";
  const sessionMaxAgeSec = CUSTOMER_SESSION_DAYS * 24 * 60 * 60;
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    path: "/",
    ...(refreshCookie
      ? { maxAge: sessionMaxAgeSec * 1000 }
      : { maxAge: 15 * 60 * 1000 }),
  };
}

/**
 * Register a new customer portal account.
 */
async function Register({
  firstName,
  lastName,
  email,
  phone,
  password,
  inviteToken,
} = {}) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  const normalizedInviteToken =
    typeof inviteToken === "string" ? inviteToken.trim() : "";

  let invitedCustomer = null;
  if (normalizedInviteToken) {
    const inviteHash = cryptoUtil.hashToken(normalizedInviteToken);
    invitedCustomer = await Customer.findOne({
      portalInviteTokenHash: inviteHash,
      isGuest: true,
    });

    if (!invitedCustomer) {
      return Response(false, "Invalid or expired onboarding link", null);
    }

    if (
      !invitedCustomer.portalInviteTokenExpiresAt ||
      invitedCustomer.portalInviteTokenExpiresAt <= new Date()
    ) {
      return Response(false, "Invalid or expired onboarding link", null);
    }

    if (String(invitedCustomer.email || "").toLowerCase() !== normalizedEmail) {
      return Response(
        false,
        "This onboarding link is for a different email address",
        null,
      );
    }
  }

  const existing = await Customer.findOne({ email: normalizedEmail }).lean();
  if (existing && !existing.isGuest) {
    return Response(false, "An account with this email already exists", null);
  }

  const passwordHash = await passwordUtil.hashPassword(password);

  let customer;
  if (invitedCustomer) {
    customer = await Customer.findByIdAndUpdate(
      invitedCustomer._id,
      {
        $set: {
          firstName: String(firstName || "").trim(),
          lastName: String(lastName || "").trim(),
          phone: phone ? String(phone).trim() : null,
          passwordHash,
          isGuest: false,
          status: "active",
          emailVerifiedAt: null,
          portalInviteAcceptedAt: new Date(),
        },
        $unset: {
          portalInviteTokenHash: 1,
          portalInviteTokenExpiresAt: 1,
          portalInviteSentAt: 1,
        },
      },
      { new: true },
    );
  } else if (existing && existing.isGuest) {
    // Convert guest to registered
    customer = await Customer.findByIdAndUpdate(
      existing._id,
      {
        $set: {
          firstName: String(firstName || "").trim(),
          lastName: String(lastName || "").trim(),
          phone: phone ? String(phone).trim() : null,
          passwordHash,
          isGuest: false,
          status: "active",
          emailVerifiedAt: null,
        },
      },
      { new: true },
    );
  } else {
    customer = await Customer.create({
      firstName: String(firstName || "").trim(),
      lastName: String(lastName || "").trim(),
      email: normalizedEmail,
      phone: phone ? String(phone).trim() : null,
      passwordHash,
      isGuest: false,
      status: "active",
      emailVerifiedAt: null,
    });
  }

  await setAndSendVerificationCode(customer, "registration");

  return Response(
    true,
    "Registration successful. Verify your email to continue.",
    {
      customer: sanitizeCustomer(customer),
      requiresEmailVerification: true,
    },
  );
}

async function GetRegisterInvite({ token } = {}) {
  const rawToken = String(token || "").trim();
  if (!rawToken) return Response(false, "Invite token is required", null);

  const inviteHash = cryptoUtil.hashToken(rawToken);
  const customer = await Customer.findOne({
    portalInviteTokenHash: inviteHash,
    isGuest: true,
  }).select(
    "firstName lastName email phone portalInviteTokenExpiresAt portalInviteSentAt pendingSubscriptionDraft",
  );

  if (!customer)
    return Response(false, "Invalid or expired onboarding link", null);

  if (
    !customer.portalInviteTokenExpiresAt ||
    customer.portalInviteTokenExpiresAt <= new Date()
  ) {
    return Response(false, "Invalid or expired onboarding link", null);
  }

  return Response(true, null, {
    invite: {
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone || null,
      expiresAt: customer.portalInviteTokenExpiresAt,
      subscriptionDraft: customer.pendingSubscriptionDraft || null,
    },
  });
}

/**
 * Log in a registered customer.
 */
async function Login({
  email,
  password,
  rememberMe = true,
  ip,
  userAgent,
} = {}) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  const customer = await Customer.findOne({
    email: normalizedEmail,
    isGuest: false,
  }).select("+passwordHash");

  if (!customer) {
    return Response(false, "Invalid email or password", null);
  }

  if (customer.status === "disabled") {
    return Response(
      false,
      "Your account has been disabled. Please contact support.",
      null,
    );
  }

  if (!customer.emailVerifiedAt) {
    await setAndSendVerificationCode(customer, "login");
    return Response(
      false,
      "Your email is not verified yet. Enter the 6-digit code sent to your email.",
      {
        requiresEmailVerification: true,
      },
    );
  }

  const passwordOk = await passwordUtil.verifyPassword(
    password,
    customer.passwordHash,
  );
  if (!passwordOk) {
    return Response(false, "Invalid email or password", null);
  }

  // Create session
  const session = await Session.create({
    user: customer._id, // Reuse session model, user field holds customer ID
    refreshTokenHash: "pending",
    userAgent: userAgent || null,
    ip: ip || null,
    expiresAt: new Date(
      Date.now() + CUSTOMER_SESSION_DAYS * 24 * 60 * 60 * 1000,
    ),
  });

  const accessToken = jwtUtil.signCustomerAccessToken(customer);
  const refreshToken = jwtUtil.signCustomerRefreshToken(customer, {
    sessionId: session._id,
  });

  // Store refresh token hash
  session.refreshTokenHash = cryptoUtil.hashToken(refreshToken);
  await session.save();

  return Response(true, "Login successful", {
    customer: sanitizeCustomer(customer),
    accessToken,
    refreshToken,
    sessionId: String(session._id),
  });
}

/**
 * Refresh customer access token.
 */
async function RefreshToken({ refreshToken } = {}) {
  if (!refreshToken) {
    return Response(false, "Refresh token required", null);
  }

  let payload;
  try {
    payload = jwtUtil.verifyCustomerRefreshToken(refreshToken);
  } catch {
    return Response(false, "Invalid or expired refresh token", null);
  }

  const session = await Session.findById(payload.sid);
  if (!session || session.revokedAt) {
    return Response(false, "Session not found or revoked", null);
  }

  if (session.expiresAt < new Date()) {
    return Response(false, "Session expired", null);
  }

  const tokenHash = cryptoUtil.hashToken(refreshToken);
  if (session.refreshTokenHash !== tokenHash) {
    // Possible token reuse attack – revoke session
    await session.revoke("token_reuse");
    return Response(false, "Token mismatch – session revoked", null);
  }

  const customer = await Customer.findById(payload.sub);
  if (!customer || customer.isGuest || customer.status === "disabled") {
    return Response(false, "Customer not found or disabled", null);
  }

  // Rotate tokens
  const newAccessToken = jwtUtil.signCustomerAccessToken(customer);
  const newRefreshToken = jwtUtil.signCustomerRefreshToken(customer, {
    sessionId: session._id,
  });
  session.refreshTokenHash = cryptoUtil.hashToken(newRefreshToken);
  await session.save();

  return Response(true, "Token refreshed", {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  });
}

/**
 * Logout – revoke session.
 */
async function Logout({ sessionId } = {}) {
  if (sessionId) {
    const session = await Session.findById(sessionId);
    if (session && !session.revokedAt) {
      await session.revoke("logout");
    }
  }
  return Response(true, "Logged out successfully", null);
}

/**
 * Forgot password – send reset link.
 */
async function ForgotPassword({ email } = {}) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  // Always return same message to prevent user enumeration
  const genericMessage = "If an account exists, a reset link has been sent.";

  const customer = await Customer.findOne({
    email: normalizedEmail,
    isGuest: false,
  });
  if (!customer || customer.status === "disabled") {
    return Response(true, genericMessage, null);
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = cryptoUtil.hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  customer.passwordResetTokenHash = tokenHash;
  customer.passwordResetTokenExpiresAt = expiresAt;
  await customer.save();

  const frontendUrl =
    process.env.NODE_ENV === "production"
      ? process.env.CUSTOMER_PORTAL_URL_PROD ||
        process.env.CLIENT_FRONT_URL_PROD
      : process.env.CUSTOMER_PORTAL_URL_DEV || "http://localhost:5173";

  const resetLink = `${frontendUrl}/reset-password?token=${rawToken}`;

  try {
    const emailResult = await sendEmail(
      customer.email,
      "Reset your Levants Dairy password",
      "resetPassword",
      {
        name: customer.firstName,
        resetLink,
      },
    );

    if (!emailResult?.success) {
      const reasonText =
        emailResult?.error?.message || "Unknown provider error";
      console.error(
        `[CustomerAuth] Failed to send password reset email: ${reasonText}`,
      );
    }
  } catch (err) {
    console.error(
      "[CustomerAuth] Failed to send password reset email:",
      err.message,
    );
  }

  return Response(true, genericMessage, null);
}

/**
 * Reset password with token.
 */
async function ResetPassword({ token, password } = {}) {
  const tokenHash = cryptoUtil.hashToken(String(token || ""));

  const customer = await Customer.findOne({
    passwordResetTokenHash: tokenHash,
    passwordResetTokenExpiresAt: { $gt: new Date() },
    isGuest: false,
  }).select("+passwordResetTokenHash +passwordResetTokenExpiresAt");

  if (!customer) {
    return Response(false, "Invalid or expired reset token", null);
  }

  const passwordHash = await passwordUtil.hashPassword(password);

  customer.passwordHash = passwordHash;
  customer.passwordResetTokenHash = null;
  customer.passwordResetTokenExpiresAt = null;
  await customer.save();

  // Revoke all sessions for this customer
  await Session.updateMany(
    { user: customer._id, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: "password_reset" } },
  );

  return Response(true, "Password reset successfully", null);
}

/**
 * Get authenticated customer profile.
 */
async function GetMe({ customerId } = {}) {
  const customer = await Customer.findById(customerId).lean();
  if (!customer) return Response(false, "Customer not found", null);
  return Response(true, null, { customer: sanitizeCustomer(customer) });
}

/**
 * Update customer profile.
 */
async function UpdateProfile({
  customerId,
  firstName,
  lastName,
  email,
  phone,
  themePreference,
  notificationPreferences,
} = {}) {
  let emailChangeRequested = false;
  const customer = await Customer.findById(customerId).select(
    "+pendingEmailTokenHash",
  );
  if (!customer) return Response(false, "Customer not found", null);

  if (firstName !== undefined) customer.firstName = String(firstName).trim();
  if (lastName !== undefined) customer.lastName = String(lastName).trim();
  if (phone !== undefined) customer.phone = phone ? String(phone).trim() : null;
  if (themePreference !== undefined) customer.themePreference = themePreference;
  if (notificationPreferences !== undefined)
    customer.notificationPreferences = notificationPreferences;

  if (email !== undefined) {
    const normalizedEmail = String(email).trim().toLowerCase();

    const existing = await Customer.findOne({
      email: normalizedEmail,
      isGuest: false,
      _id: { $ne: customerId },
    }).lean();
    if (existing) {
      return Response(false, "An account with this email already exists", null);
    }

    if (normalizedEmail !== customer.email) {
      emailChangeRequested = true;
      const rawToken = crypto.randomBytes(32).toString("hex");
      customer.pendingEmail = normalizedEmail;
      customer.pendingEmailTokenHash = cryptoUtil.hashToken(rawToken);
      customer.pendingEmailTokenExpiresAt = new Date(
        Date.now() + EMAIL_CHANGE_TOKEN_TTL_MINUTES * 60 * 1000,
      );

      const verifyLink = buildCustomerEmailChangeConfirmLink(
        customer._id,
        rawToken,
      );

      try {
        if (verifyLink) {
          const emailResult = await sendEmail(
            normalizedEmail,
            "Confirm your new email",
            "verifyEmailChange",
            {
              name: customer.firstName,
              verifyLink,
              expiresInMinutes: EMAIL_CHANGE_TOKEN_TTL_MINUTES,
            },
          );

          if (!emailResult?.success) {
            const reasonText =
              emailResult?.error?.message || "Unknown provider error";
            console.error(
              `[CustomerAuth] Failed to send email change verification: ${reasonText}`,
            );
          }
        }
      } catch (err) {
        console.error(
          "[CustomerAuth] Failed to send email change verification:",
          err.message,
        );
      }
    }
  }

  await customer.save();

  const message = emailChangeRequested
    ? "Profile updated. Confirm your new email from the verification link we sent."
    : "Profile updated";

  return Response(true, message, {
    customer: sanitizeCustomer(customer),
  });
}

async function VerifyEmailCode({ email, code } = {}) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  const customer = await Customer.findOne({
    email: normalizedEmail,
    isGuest: false,
  }).select("+emailVerificationCodeHash");

  if (!customer) {
    return Response(false, "Invalid verification code", null);
  }

  if (
    !customer.emailVerificationCodeHash ||
    !customer.emailVerificationCodeExpiresAt
  ) {
    return Response(
      false,
      "No verification code found. Please request a new code.",
      null,
    );
  }

  if (customer.emailVerificationCodeExpiresAt <= new Date()) {
    return Response(
      false,
      "Verification code expired. Please request a new code.",
      null,
    );
  }

  const submittedHash = cryptoUtil.hashToken(String(code || ""));
  if (submittedHash !== customer.emailVerificationCodeHash) {
    return Response(false, "Invalid verification code", null);
  }

  customer.emailVerifiedAt = new Date();
  customer.emailVerificationCodeHash = null;
  customer.emailVerificationCodeExpiresAt = null;
  await customer.save();

  return Response(true, "Email verified successfully", {
    customer: sanitizeCustomer(customer),
  });
}

async function ResendVerificationCode({ email } = {}) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  const genericMessage =
    "If an account exists, a verification code has been sent.";

  const customer = await Customer.findOne({
    email: normalizedEmail,
    isGuest: false,
  });

  if (!customer || customer.status === "disabled" || customer.emailVerifiedAt) {
    return Response(true, genericMessage, null);
  }

  await setAndSendVerificationCode(customer, "resend");
  return Response(true, genericMessage, null);
}

async function ConfirmEmailChange({ userId, token } = {}) {
  if (!mongoose.Types.ObjectId.isValid(String(userId || ""))) {
    return Response(false, "Invalid request", null);
  }

  const customer = await Customer.findById(userId).select(
    "+pendingEmailTokenHash",
  );
  if (!customer) return Response(false, "Customer not found", null);

  if (
    !customer.pendingEmail ||
    !customer.pendingEmailTokenHash ||
    !customer.pendingEmailTokenExpiresAt
  ) {
    return Response(false, "No pending email change found", null);
  }

  if (customer.pendingEmailTokenExpiresAt <= new Date()) {
    return Response(false, "Email change confirmation link has expired", null);
  }

  const tokenHash = cryptoUtil.hashToken(String(token || ""));
  if (tokenHash !== customer.pendingEmailTokenHash) {
    return Response(false, "Invalid email change confirmation token", null);
  }

  const existing = await Customer.findOne({
    _id: { $ne: customer._id },
    email: customer.pendingEmail,
    isGuest: false,
  }).lean();
  if (existing) {
    return Response(false, "An account with this email already exists", null);
  }

  const oldEmail = customer.email;
  const newEmail = customer.pendingEmail;

  customer.email = newEmail;
  customer.pendingEmail = null;
  customer.pendingEmailTokenHash = null;
  customer.pendingEmailTokenExpiresAt = null;
  customer.emailVerifiedAt = new Date();
  await customer.save();

  try {
    const emailResult = await sendEmail(
      newEmail,
      "Your email was changed",
      "emailChanged",
      {
        name: customer.firstName,
        oldEmail,
        newEmail,
        when: new Date().toISOString(),
      },
    );

    if (!emailResult?.success) {
      const reasonText =
        emailResult?.error?.message || "Unknown provider error";
      console.error(
        `[CustomerAuth] Failed to send email changed notice: ${reasonText}`,
      );
    }
  } catch {
    // no-op
  }

  return Response(true, "Email address updated successfully", {
    customer: sanitizeCustomer(customer),
  });
}

/**
 * Change password.
 */
async function ChangePassword({
  customerId,
  currentPassword,
  newPassword,
} = {}) {
  const customer = await Customer.findById(customerId).select("+passwordHash");
  if (!customer) return Response(false, "Customer not found", null);

  const passwordOk = await passwordUtil.verifyPassword(
    currentPassword,
    customer.passwordHash,
  );
  if (!passwordOk)
    return Response(false, "Current password is incorrect", null);

  const newHash = await passwordUtil.hashPassword(newPassword);
  customer.passwordHash = newHash;
  await customer.save();

  // Revoke all other sessions
  await Session.updateMany(
    { user: customer._id, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: "password_changed" } },
  );

  return Response(true, "Password changed successfully", null);
}

function sanitizeCustomer(c) {
  if (!c) return null;
  const obj = c.toObject ? c.toObject() : { ...c };
  delete obj.passwordHash;
  delete obj.passwordResetTokenHash;
  delete obj.passwordResetTokenExpiresAt;
  delete obj.emailVerificationCodeHash;
  delete obj.pendingEmailTokenHash;
  delete obj.__v;
  return obj;
}

module.exports = {
  Register,
  GetRegisterInvite,
  Login,
  RefreshToken,
  Logout,
  ForgotPassword,
  ResetPassword,
  VerifyEmailCode,
  ResendVerificationCode,
  ConfirmEmailChange,
  GetMe,
  UpdateProfile,
  ChangePassword,
  sanitizeCustomer,
  buildCookieOptions,
  PORTAL_COOKIE_NAME,
  PORTAL_REFRESH_COOKIE_NAME,
};
