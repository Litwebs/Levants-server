"use strict";

const mongoose = require("mongoose");
const User = require("../models/user.model");
const jwtUtil = require("../utils/jwt.util");
const passwordUtil = require("../utils/password.util");
const Session = require("../models/session.model");
const cryptoUtil = require("../utils/crypto.util");
const sendEmail = require("../Integration/Email.service");
const {
  INVALID_EMAIL_OR_PASSWORD,
  ACCOUNT_DISABLED,
  LOGIN_SUCCESSFUL,
  TOKEN_AND_CODE_REQUIRED,
  _2FA_CODE_USED,
  _2FA_CODE_SENT,
  _2FA_CODE_VALIDATED,
  INVALID_CODE,
  MAX_ATTEMPTS,
  TOO_MANY_ATTEMPTS,
  TOKEN_REQUIRED,
  INVALID_OR_EXPIRED_TOKEN,
  TOKEN_GENERATED,
  LOGGED_OUT,
  USER_NOT_FOUND,
  NO_ACTIVE_2FA_SESSION,
  INVALID_OR_EXPIRED_SESSION,
} = require("../constants/Auth.constants");
const { Response } = require("../utils/response.util");
const { sanitizeUser } = require("../utils/authUser.util");
const {
  getSessionExpiryDate,
  generate6DigitCode,
} = require("../utils/authSession.util");

const Login = async ({
  email,
  password,
  rememberMe = false,
  ip,
  userAgent,
}) => {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  const user = await User.findOne({ email: normalizedEmail })
    .select("+passwordHash")
    .populate("role", "name");
  if (!user) return Response(false, INVALID_EMAIL_OR_PASSWORD, null);

  if (user.status === "disabled" || user.archived) {
    return Response(false, ACCOUNT_DISABLED, null);
  }

  const passwordOk = await passwordUtil.verifyPassword(
    password,
    user.passwordHash,
  );
  if (!passwordOk) return Response(false, INVALID_EMAIL_OR_PASSWORD, null);

  if (user.twoFactorEnabled) {
    const code = generate6DigitCode();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes

    user.twoFactorLogin = {
      codeHash: cryptoUtil.hashToken(code),
      expiresAt,
      attempts: 0,
      maxAttempts: 6,
      usedAt: null,
      ip: ip || null,
      userAgent: userAgent || null,
      rememberMe: !!rememberMe,
    };

    await user.save();

    // You need an email template called "login2FA" (or rename here)
    await sendEmail(user.email, "Your login code", "login2FA", {
      name: user.name,
      code,
      expiresMinutes: 10,
      ip: ip || "",
    });

    const tempToken = jwtUtil.sign2FATempToken(user, {
      rememberMe: !!rememberMe,
    });

    return Response(true, _2FA_CODE_SENT, {
      requires2FA: true,
      tempToken,
      expiresAt,
    });
  }

  // ✅ Normal login (existing behavior)
  const sessionId = new mongoose.Types.ObjectId();
  const expiresAt = getSessionExpiryDate(rememberMe);

  const accessToken = jwtUtil.signAccessToken(user);
  const refreshToken = jwtUtil.signRefreshToken(user, {
    rememberMe,
    sessionId: sessionId.toString(),
  });

  await Session.create({
    _id: sessionId,
    user: user._id,
    refreshTokenHash: cryptoUtil.hashToken(refreshToken),
    userAgent,
    ip,
    expiresAt,
  });

  user.lastLoginAt = new Date();
  await user.save();

  return {
    success: true,
    message: LOGIN_SUCCESSFUL,
    data: {
      user: sanitizeUser(user),
      accessToken,
      refreshToken,
      rememberMe,
    },
  };
};

const Verify2FA = async ({ tempToken, code, ip, userAgent }) => {
  if (!tempToken || !code) {
    return {
      success: false,
      message: TOKEN_AND_CODE_REQUIRED,
      data: null,
    };
  }

  let payload;
  try {
    payload = jwtUtil.verify2FATempToken(tempToken);
  } catch {
    return {
      success: false,
      message: INVALID_OR_EXPIRED_SESSION,
      data: null,
    };
  }

  // ✅ IMPORTANT: only add the excluded field; keep the rest of user + twoFactorLogin intact
  const user = await User.findById(payload.sub)
    .select("+twoFactorLogin +twoFactorLogin.codeHash +twoFactorLogin.attempts")
    .populate("role");

  if (!user) return Response(false, USER_NOT_FOUND, null);

  if (user.status === "disabled" || user.archived) {
    return Response(false, USER_NOT_FOUND, null);
  }

  const tfl = user.twoFactorLogin;

  if (!tfl?.codeHash || !tfl?.expiresAt) {
    return Response(false, NO_ACTIVE_2FA_SESSION, null);
  }

  if (tfl.usedAt) {
    return Response(false, _2FA_CODE_USED, null);
  }

  if (tfl.expiresAt < new Date()) {
    user.twoFactorLogin = undefined;
    await user.save();
    return Response(false, INVALID_CODE, null);
  }

  const maxAttempts = Number(tfl.maxAttempts || MAX_ATTEMPTS);
  const attempts = Number(tfl.attempts || 0);

  if (attempts >= maxAttempts) {
    return Response(false, TOO_MANY_ATTEMPTS, null);
  }

  const incomingHash = cryptoUtil.hashToken(String(code).trim());
  if (incomingHash !== tfl.codeHash) {
    user.twoFactorLogin.attempts = attempts + 1;
    await user.save();
    return Response(false, INVALID_CODE, null);
  }

  // ✅ success: consume challenge
  const rememberMe = !!tfl.rememberMe;

  user.twoFactorLogin = undefined;
  user.lastLoginAt = new Date();
  await user.save();

  // issue real session + tokens now
  const sessionId = new mongoose.Types.ObjectId();
  const expiresAt = getSessionExpiryDate(rememberMe);

  const accessToken = jwtUtil.signAccessToken(user);
  const refreshToken = jwtUtil.signRefreshToken(user, {
    rememberMe,
    sessionId: sessionId.toString(),
  });

  await Session.create({
    _id: sessionId,
    user: user._id,
    refreshTokenHash: cryptoUtil.hashToken(refreshToken),
    userAgent,
    ip,
    expiresAt,
  });

  return Response(true, _2FA_CODE_VALIDATED, {
    user: sanitizeUser(user),
    accessToken,
    refreshToken,
    rememberMe,
  });
};

const Enable2FA = async ({ userId }) => {
  const user = await User.findById(userId).populate("role");
  if (!user) return Response(false, USER_NOT_FOUND, null);

  user.twoFactorEnabled = !user.twoFactorEnabled;
  await user.save();

  return Response(
    true,
    `2 Factor authentication ${user.twoFactorEnabled ? "enabled" : "disabled"}`,
    { enabled: user.twoFactorEnabled },
  );
};

const RefreshToken = async ({ refreshToken, ip, userAgent }) => {
  if (!refreshToken) {
    return Response(false, TOKEN_REQUIRED, null);
  }

  let payload;
  try {
    payload = jwtUtil.verifyRefreshToken(refreshToken);
  } catch (e) {
    return Response(false, INVALID_OR_EXPIRED_TOKEN, null);
  }

  const session = await Session.findById(payload.sid);
  if (!session) {
    return Response(false, INVALID_OR_EXPIRED_SESSION, null);
  }

  if (session.revokedAt) {
    return Response(false, INVALID_OR_EXPIRED_SESSION, null);
  }

  const now = new Date();

  if (session.expiresAt <= now) {
    return Response(false, INVALID_OR_EXPIRED_SESSION, null);
  }

  if (session.user.toString() !== payload.sub) {
    await session.revoke("SESSION_USER_MISMATCH");
    return Response(false, INVALID_OR_EXPIRED_SESSION, null);
  }

  const incomingHash = cryptoUtil.hashToken(refreshToken);
  if (incomingHash !== session.refreshTokenHash) {
    // Token is stale/invalid (or a concurrent refresh already rotated it).
    // Do not revoke here to avoid false-positive revocation during races.
    return Response(false, INVALID_OR_EXPIRED_TOKEN, null);
  }

  const user = await User.findById(payload.sub).populate("role");
  if (!user || user.status === "disabled" || user.archived) {
    await session.revoke("USER_INACTIVE");
    return Response(false, USER_NOT_FOUND, null);
  }

  const newAccessToken = jwtUtil.signAccessToken(user);

  // rotate refresh token, keep same session id
  const newRefreshToken = jwtUtil.signRefreshToken(user, {
    rememberMe: !!payload.rememberMe,
    sessionId: session._id.toString(),
  });

  const newRefreshTokenHash = cryptoUtil.hashToken(newRefreshToken);

  // Atomic compare-and-swap update: only one concurrent refresh can rotate.
  const updateResult = await Session.updateOne(
    {
      _id: session._id,
      revokedAt: null,
      refreshTokenHash: incomingHash,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        refreshTokenHash: newRefreshTokenHash,
        expiresAt: getSessionExpiryDate(!!payload.rememberMe),
        ip: ip || session.ip,
        userAgent: userAgent || session.userAgent,
      },
    },
  );

  const modifiedCount =
    updateResult?.modifiedCount ?? updateResult?.nModified ?? 0;

  if (modifiedCount !== 1) {
    // Another request rotated the token first.
    return Response(false, INVALID_OR_EXPIRED_TOKEN, null);
  }

  return Response(true, TOKEN_GENERATED, {
    user: sanitizeUser(user),
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    rememberMe: !!payload.rememberMe,
  });
};

const Logout = async ({ refreshToken, userId }) => {
  // If refresh token is present (body), revoke just that session
  if (refreshToken) {
    try {
      const payload = jwtUtil.verifyRefreshToken(refreshToken);
      const session = await Session.findById(payload.sid);
      if (session && !session.revokedAt) {
        await session.revoke("LOGOUT");
      }
      Response(true, LOGGED_OUT, null);
    } catch {
      // ignore
      Response(true, LOGGED_OUT, null);
    }
  }

  // If no refresh token (likely due to cookie path scoping),
  // optionally revoke all sessions for this user if we have userId.
  if (userId) {
    await Session.updateMany(
      { user: userId, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: "LOGOUT_ALL" } },
    );
  }

  return Response(true, LOGGED_OUT, null);
};

module.exports = { Login, Verify2FA, Enable2FA, RefreshToken, Logout };
