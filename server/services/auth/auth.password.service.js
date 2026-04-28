"use strict";

const crypto = require("crypto");
const User = require("../../models/user.model");
const PasswordResetToken = require("../../models/passwordResetToken.model");
const passwordUtil = require("../../utils/password.util");
const Session = require("../../models/session.model");
const cryptoUtil = require("../../utils/crypto.util");
const sendEmail = require("../../Integration/Email.service");
const { FRONTEND_URL } = require("../../config/env");
const {
  INVALID_OR_EXPIRED_TOKEN,
  IF_ACCOUNT_EXISTS,
  PASSWORD_RESET_SUCCESSFUL,
  TOKEN_VERIFIED,
  USER_NOT_FOUND,
  CURRENT_PASSWORD_INCORRECT,
  NEW_PASSWORD_MUST_BE_DIFFERENT,
  PASSWORD_CHANGED_SUCCESSFULLY,
} = require("../../constants/Auth.constants");
const { Response } = require("../../utils/response.util");

const ForgotPassword = async ({ email, ip, userAgent } = {}) => {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    return Response(true, IF_ACCOUNT_EXISTS, null);
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = cryptoUtil.hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  await PasswordResetToken.create({
    user: user._id,
    tokenHash,
    expiresAt,
    ip,
    userAgent,
  });

  const resetLink = `${FRONTEND_URL}/reset-password?token=${rawToken}`;

  await sendEmail(user.email, "Reset Your Password", "resetPassword", {
    name: user.name,
    resetLink,
  });
  return Response(true, IF_ACCOUNT_EXISTS, null);
};

const ResetPassword = async ({ token, newPassword, ip, userAgent }) => {
  const tokenHash = cryptoUtil.hashToken(token);

  const resetRecord = await PasswordResetToken.findOne({ tokenHash });
  if (!resetRecord || !resetRecord.isValid()) {
    return Response(false, INVALID_OR_EXPIRED_TOKEN, null);
  }

  const user = await User.findById(resetRecord.user)
    .select("+passwordHash")
    .populate("role");
  if (!user) {
    return Response(false, USER_NOT_FOUND, { reason: "USER_NOT_FOUND" });
  }

  const newHash = await passwordUtil.hashPassword(newPassword);
  user.passwordHash = newHash;
  await user.save();

  await resetRecord.markUsed();

  // Revoke all existing sessions after password reset
  const now = new Date();
  await Session.updateMany(
    { user: user._id, revokedAt: null },
    { $set: { revokedAt: now, revokedReason: "PASSWORD_RESET" } },
  );

  // Audit temporarily disabled

  return Response(true, PASSWORD_RESET_SUCCESSFUL, null);
};

const VerifyResetPasswordToken = async (token) => {
  const tokenHash = cryptoUtil.hashToken(token);

  const resetRecord = await PasswordResetToken.findOne({ tokenHash });

  if (!resetRecord || !resetRecord.isValid()) {
    return Response(false, INVALID_OR_EXPIRED_TOKEN, { valid: false });
  }

  return Response(true, TOKEN_VERIFIED, { valid: true });
};

const ChangePassword = async ({
  userId,
  currentPassword,
  newPassword,
  ip,
  userAgent,
}) => {
  const user = await User.findById(userId)
    .select("+passwordHash")
    .populate("role");
  if (!user) {
    return Response(false, USER_NOT_FOUND, { reason: "USER_NOT_FOUND" });
  }

  const passwordOk = await passwordUtil.verifyPassword(
    currentPassword,
    user.passwordHash,
  );
  if (!passwordOk) {
    return Response(false, CURRENT_PASSWORD_INCORRECT, null);
  }

  if (String(newPassword) === String(currentPassword)) {
    return Response(false, NEW_PASSWORD_MUST_BE_DIFFERENT, null);
  }

  const newHash = await passwordUtil.hashPassword(newPassword);
  user.passwordHash = newHash;
  await user.save();

  return Response(true, PASSWORD_CHANGED_SUCCESSFULLY, null);
};

module.exports = {
  ForgotPassword,
  ResetPassword,
  VerifyResetPasswordToken,
  ChangePassword,
};
