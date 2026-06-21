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

function buildCookieOptions({
  rememberMe = false,
  refreshCookie = false,
} = {}) {
  const isProduction = process.env.NODE_ENV === "production";
  const maxAgeSec = rememberMe ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60;
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "strict" : "lax",
    path: "/",
    ...(refreshCookie
      ? { maxAge: maxAgeSec * 1000 }
      : { maxAge: 15 * 60 * 1000 }),
  };
}

/**
 * Register a new customer portal account.
 */
async function Register({ firstName, lastName, email, phone, password } = {}) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  const existing = await Customer.findOne({ email: normalizedEmail }).lean();
  if (existing && !existing.isGuest) {
    return Response(false, "An account with this email already exists", null);
  }

  const passwordHash = await passwordUtil.hashPassword(password);

  let customer;
  if (existing && existing.isGuest) {
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
    });
  }

  return Response(true, "Registration successful", {
    customer: sanitizeCustomer(customer),
  });
}

/**
 * Log in a registered customer.
 */
async function Login({
  email,
  password,
  rememberMe = false,
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
      Date.now() + (rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000,
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

  const resetLink = `${frontendUrl}/portal/reset-password?token=${rawToken}`;

  try {
    await sendEmail(
      customer.email,
      "Reset your Levants Dairy password",
      "portalPasswordReset",
      {
        firstName: customer.firstName,
        resetLink,
      },
    );
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
  phone,
  notificationPreferences,
} = {}) {
  const updates = {};
  if (firstName !== undefined) updates.firstName = String(firstName).trim();
  if (lastName !== undefined) updates.lastName = String(lastName).trim();
  if (phone !== undefined) updates.phone = phone ? String(phone).trim() : null;
  if (notificationPreferences !== undefined)
    updates.notificationPreferences = notificationPreferences;

  const customer = await Customer.findByIdAndUpdate(
    customerId,
    { $set: updates },
    { new: true },
  );
  if (!customer) return Response(false, "Customer not found", null);
  return Response(true, "Profile updated", {
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
  delete obj.__v;
  return obj;
}

module.exports = {
  Register,
  Login,
  RefreshToken,
  Logout,
  ForgotPassword,
  ResetPassword,
  GetMe,
  UpdateProfile,
  ChangePassword,
  sanitizeCustomer,
  buildCookieOptions,
  PORTAL_COOKIE_NAME,
  PORTAL_REFRESH_COOKIE_NAME,
};
