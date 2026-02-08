const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/user.model");
const Role = require("../models/role.model");
const PasswordResetToken = require("../models/passwordResetToken.model");
const jwtUtil = require("../utils/jwt.util");
const passwordUtil = require("../utils/password.util");
const Session = require("../models/session.model");
const cryptoUtil = require("../utils/crypto.util");
const sendEmail = require("../Integration/Email.service");
const { FRONTEND_URL } = require("../config/env");
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
  IF_ACCOUNT_EXISTS,
  PASSWORD_RESET_SUCCESSFUL,
  TOKEN_VERIFIED,
  USER_NOT_FOUND,
  NO_ACTIVE_2FA_SESSION,
  CURRENT_PASSWORD_INCORRECT,
  NEW_PASSWORD_MUST_BE_DIFFERENT,
  PASSWORD_CHANGED_SUCCESSFULLY,
  SESSION_REVOKED,
  SESSION_NOT_FOUND,
  USER_ID_REQUIRED,
  INVALID_OR_EXPIRED_SESSION,
  SESSION_ID_REQUIRED,
  OK,
} = require("../constants/Auth.constants");

const { Response } = require("../utils/response.util");

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
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

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
    await sendEmail(user.email, "Your Litwebs login code", "login2FA", {
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

const GetAuthenticatedUser = async ({ userId }) => {
  const user = await User.findById(userId).populate("role");
  if (!user) {
    return Response(false, USER_NOT_FOUND, null);
  }

  return Response(true, OK, { user: sanitizeUser(user) });
};

const GetSessions = async ({ userId, currentSessionId }) => {
  if (!userId) {
    return Response(false, USER_ID_REQUIRED, null);
  }

  const now = new Date();
  const rows = await Session.find({
    user: userId,
    expiresAt: { $gt: now },
    revokedAt: null,
  })
    .select("-refreshTokenHash")
    .sort({ updatedAt: -1 })
    .lean();

  const sessions = rows.map((s) => ({
    _id: String(s._id),
    user: String(s.user),
    userAgent: s.userAgent || null,

    // ✅ pretty label for UI (no DB changes)
    label: sessionLabelFromUserAgent(s.userAgent, s.ip),

    ip: s.ip || null,
    expiresAt: s.expiresAt,
    revokedAt: s.revokedAt || null,
    revokedReason: s.revokedReason || null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    isCurrent: currentSessionId
      ? String(s._id) === String(currentSessionId)
      : false,
  }));

  return Response(true, OK, { sessions });
};

const RevokeOtherSessions = async ({ userId, currentSessionId }) => {
  if (!userId) {
    return Response(false, USER_ID_REQUIRED, null);
  }

  const now = new Date();

  const filter = {
    user: userId,
    revokedAt: null,
    expiresAt: { $gt: now },
  };

  if (currentSessionId) {
    filter._id = { $ne: currentSessionId };
  }

  const result = await Session.updateMany(filter, {
    $set: {
      revokedAt: now,
      revokedReason: "REVOKE_OTHERS",
    },
  });

  const revoked =
    typeof result.modifiedCount === "number"
      ? result.modifiedCount
      : result.nModified || 0;

  return Response(true, SESSION_REVOKED, { revoked });
};

const RevokeSession = async ({ userId, sessionId }) => {
  if (!userId) {
    return Response(false, USER_ID_REQUIRED, null);
  }
  if (!sessionId) {
    return Response(false, SESSION_ID_REQUIRED, null);
  }

  const now = new Date();

  // Ensure: session belongs to user and is active
  const session = await Session.findOne({
    _id: sessionId,
    user: userId,
    revokedAt: null,
  });

  if (!session) {
    return Response(false, SESSION_NOT_FOUND, { reason: "SESSION_NOT_FOUND" });
  }

  session.revokedAt = now;
  session.revokedReason = "USER_REVOKE";
  await session.save();

  return Response(true, SESSION_REVOKED, null);
};

const UpdateUserStatus = async ({ targetUserId, status, actorUserId }) => {
  if (String(targetUserId) === String(actorUserId)) {
    return {
      success: false,
      statusCode: 400,
      message: "You cannot change your own account status",
    };
  }

  const user = await User.findById(targetUserId);

  if (!user) {
    return {
      success: false,
      statusCode: 404,
      message: "User not found",
    };
  }

  if (user.status === status) {
    return {
      success: true,
      data: { user: sanitizeUser(user) },
    };
  }

  user.status = status;
  await user.save();

  return {
    success: true,
    data: { user: sanitizeUser(user) },
  };
};

const GetUserById = async ({ targetUserId, requesterUserId }) => {
  // Optional rule: prevent self-lookup via admin route
  // (encourage using /me instead)
  if (String(targetUserId) === String(requesterUserId)) {
    return {
      success: false,
      statusCode: 400,
      message: "Use /me endpoint to view your own profile",
    };
  }

  const user = await User.findById(targetUserId)
    .populate("role", "name permissions")
    .select("-passwordHash -twoFactorSecret -twoFactorLogin");

  if (!user) {
    return {
      success: false,
      statusCode: 404,
      message: "User not found",
    };
  }

  return {
    success: true,
    data: { user: sanitizeUser(user) },
  };
};

const ListUsers = async ({ page = 1, pageSize = 20, status, role, search }) => {
  const query = {};

  // Optional filters
  if (status) {
    query.status = status;
  }

  if (role) {
    query.role = role; // expects role ObjectId
  }

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    User.find(query)
      .populate("role", "name")
      .select("-passwordHash -twoFactorSecret -twoFactorLogin")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize),
    User.countDocuments(query),
  ]);

  return {
    success: true,
    data: {
      users: items,
    },
    meta: {
      page,
      pageSize,
      total,
    },
  };
};

const UpdateUser = async ({ targetUserId, updates, actorUserId }) => {
  // ❌ Prevent admin editing themselves via admin route
  if (String(targetUserId) === String(actorUserId)) {
    return {
      success: false,
      statusCode: 400,
      message: "Use profile settings to update your own account",
    };
  }

  const user = await User.findById(targetUserId);
  if (!user) {
    return {
      success: false,
      statusCode: 404,
      message: "User not found",
    };
  }

  const { name, email, roleId, status, password, preferences } = updates;

  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;
  if (status !== undefined) user.status = status;

  // Preferences (notifications only)
  if (preferences?.notifications) {
    const existingNotifications = user.preferences?.notifications?.toObject
      ? user.preferences.notifications.toObject()
      : user.preferences?.notifications || {};

    user.set("preferences.notifications", {
      ...existingNotifications,
      ...preferences.notifications,
    });
  }

  // Role change
  if (roleId) {
    const role = await Role.findById(roleId);
    if (!role) {
      return {
        success: false,
        statusCode: 400,
        message: "Invalid role",
      };
    }
    user.role = role._id;
  }

  // Password change
  if (password) {
    const newHash = await passwordUtil.hashPassword(password);
    user.passwordHash = newHash;
  }

  await user.save();

  const updatedUser = await User.findById(user._id)
    .populate("role", "name permissions")
    .select("-passwordHash -twoFactorSecret -twoFactorLogin");

  return {
    success: true,
    data: { user: sanitizeUser(updatedUser) },
  };
};

const UpdateSelf = async ({ userId, updates }) => {
  const user = await User.findById(userId);
  if (!user) {
    return {
      success: false,
      statusCode: 404,
      message: "User not found",
    };
  }

  const { name, email, preferences } = updates;

  if (name !== undefined) user.name = name;
  if (email !== undefined) user.email = email;

  if (preferences) {
    if (preferences.theme !== undefined) {
      user.set("preferences.theme", preferences.theme);
    }

    if (preferences.language !== undefined) {
      user.set("preferences.language", preferences.language);
    }

    if (preferences.notifications) {
      const existingNotifications = user.preferences?.notifications?.toObject
        ? user.preferences.notifications.toObject()
        : user.preferences?.notifications || {};

      user.set("preferences.notifications", {
        ...existingNotifications,
        ...preferences.notifications,
      });
    }
  }

  await user.save();

  const updatedUser = await User.findById(user._id)
    .populate("role", "name")
    .select("-passwordHash -twoFactorSecret -twoFactorLogin");

  return {
    success: true,
    data: { user: sanitizeUser(updatedUser) },
  };
};

const sanitizeUser = (user) => {
  if (!user) return null;

  const obj = user.toJSON ? user.toJSON() : { ...user };

  delete obj.passwordHash;
  delete obj.twoFactorSecret;
  delete obj.pendingEmailTokenHash;
  delete obj.twoFactorLogin;
  delete obj.__v;

  if (obj.pendingEmail) {
    obj.emailChange = {
      pending: true,
      pendingEmail: obj.pendingEmail,
      expiresAt: obj.pendingEmailTokenExpiresAt || null,
    };
  }
  delete obj.pendingEmailTokenExpiresAt;

  return obj;
};

function sessionLabelFromUserAgent(userAgent, ip) {
  const ua = String(userAgent || "").trim();
  const ipStr = String(ip || "").trim();

  const isLocal =
    ipStr === "::1" ||
    ipStr === "127.0.0.1" ||
    ipStr === "localhost" ||
    ipStr.startsWith("192.168.") ||
    ipStr.startsWith("10.") ||
    ipStr.startsWith("172.16.");

  // Non-browser clients (common)
  const lower = ua.toLowerCase();
  if (!ua) return isLocal ? "Local · Unknown" : "Unknown · Unknown";
  if (lower.includes("postmanruntime")) return "Postman · API Client";
  if (lower.startsWith("curl/")) return "cURL · API Client";
  if (lower.includes("insomnia")) return "Insomnia · API Client";
  if (lower.includes("axios")) return "Axios · API Client";
  if (lower.includes("node-fetch") || lower.includes("undici"))
    return "Node · HTTP Client";
  if (lower.includes("okhttp")) return "Android · HTTP Client";

  // OS
  let os = "Unknown";
  if (/Windows NT/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua) && !/iPhone|iPad|iPod/i.test(ua)) os = "Mac";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone/i.test(ua)) os = "iPhone";
  else if (/iPad/i.test(ua)) os = "iPad";
  else if (/Linux/i.test(ua)) os = "Linux";

  // Browser (order matters)
  let browser = "Unknown";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/OPR\//i.test(ua)) browser = "Opera";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua) && !/OPR\//i.test(ua))
    browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";

  return `${os} · ${browser}`;
}

function getSessionExpiryDate(rememberMe) {
  const days = rememberMe ? 7 : 1;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

function generate6DigitCode() {
  // 000000 - 999999, padded
  return String(Math.floor(Math.random() * 1000000)).padStart(6, "0");
}

module.exports = {
  Login,
  RefreshToken,
  Logout,
  ForgotPassword,
  ResetPassword,
  VerifyResetPasswordToken,
  ChangePassword,
  GetAuthenticatedUser,
  Enable2FA,
  Verify2FA,
  GetSessions,
  RevokeOtherSessions,
  RevokeSession,
  UpdateUserStatus,
  GetUserById,
  ListUsers,
  UpdateUser,
  UpdateSelf,
};
