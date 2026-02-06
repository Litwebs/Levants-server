const authService = require("../services/auth.service");
const mongoose = require("mongoose");
const User = require("../models/user.model");
const jwtUtil = require("../utils/jwt.util");
const { sendOk, sendNoContent, sendErr } = require("../utils/response.util");
const {
  CURRENT_PASSWORD_AND_NEW_PASSWORD_REQUIRED,
  EMAIL_OR_PASSWORD_REQUIRED,
  EMAIL_REQUIRED,
  TOKEN_REQUIRED,
  SESSION_ID_REQUIRED,
} = require("../constants/Auth.constants");

// USED TO CHECK IF AUTHENTICATED
const CheckAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const headerToken =
      typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length).trim()
        : null;

    // Prefer Authorization header over cookie (explicit beats implicit)
    const cookieToken =
      (req.cookies && (req.cookies.token || req.cookies.accessToken)) || null;

    const token = headerToken || cookieToken;

    // If no token provided, return a harmless authenticated:false response
    if (!token) {
      return sendOk(res, { authenticated: false, user: null });
    }

    try {
      const decoded = jwtUtil.verifyAccessToken(token);

      // Optional DB check: if user doesn't exist anymore, treat as unauthenticated
      const user = await User.findById(decoded.sub).select("status archived");
      if (!user || user.status === "disabled" || user.archived) {
        return sendOk(res, { authenticated: false, user: null });
      }

      return sendOk(res, { authenticated: true, user: decoded });
    } catch {
      return sendOk(res, { authenticated: false, user: null });
    }
  } catch (err) {
    next(err);
  }
};

// USED TO GET ACTIVE SESSIONS
const GetSessions = async (req, res, next) => {
  try {
    const currentSessionId = getCurrentSessionIdFromRequest(req);

    const result = await authService.GetSessions({
      userId: req.user.id,
      currentSessionId,
    });

    if (!result.success) {
      return sendErr(res, {
        statusCode: 400,
        message: result.message,
      });
    }

    return sendOk(res, { sessions: result.data.sessions });
  } catch (err) {
    next(err);
  }
};

// USED TO GET CURRENT USER INFO
const GetAuthenticatedUser = async (req, res, next) => {
  try {
    const result = await authService.GetAuthenticatedUser({
      userId: req.user.id,
    });
    if (!result.success) {
      return sendErr(res, { statusCode: 404, message: result.message });
    }
    return sendOk(res, { user: result.data.user });
  } catch (err) {
    next(err);
  }
};

// USED TO TO LOGIN
const Login = async (req, res, next) => {
  try {
    const { email, password, rememberMe = false } = req.body || {};

    if (!email || !password) {
      return sendErr(res, {
        statusCode: 400,
        message: EMAIL_OR_PASSWORD_REQUIRED,
      });
    }

    const result = await authService.Login({
      email,
      password,
      rememberMe,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });
    if (!result.success) {
      return sendErr(res, {
        statusCode: 401,
        message: result.message,
      });
    }

    // ✅ 2FA step required (no cookies yet)
    if (result.data?.requires2FA) {
      return sendOk(res, {
        requires2FA: true,
        tempToken: result.data.tempToken,
        expiresAt: result.data.expiresAt || null,
      });
    }

    // Normal login (cookies)
    const { user, accessToken, refreshToken } = result.data || {};

    if (refreshToken) {
      res.cookie(
        "refreshToken",
        refreshToken,
        getRefreshTokenCookieOptions(rememberMe),
      );
    }

    if (accessToken) {
      res.cookie("accessToken", accessToken, getAccessTokenCookieOptions());
    }

    return sendOk(res, { user });
  } catch (err) {
    next(err);
  }
};

// USED TO REFRESH TOKEN
const RefreshToken = async (req, res, next) => {
  try {
    const tokenFromCookie = req.cookies?.refreshToken;
    const tokenFromBody = (req.body || {})?.refreshToken;
    const refreshTokenValue = tokenFromBody || tokenFromCookie;

    const result = await authService.RefreshToken({
      refreshToken: refreshTokenValue,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      return sendErr(res, {
        statusCode: 401,
        message: result.message,
      });
    }

    const {
      user,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      rememberMe,
    } = result.data || {};

    if (newRefreshToken) {
      const cookieOptions = getRefreshTokenCookieOptions(rememberMe);
      res.cookie("refreshToken", newRefreshToken, cookieOptions);
    }

    if (newAccessToken) {
      const accessCookieOptions = getAccessTokenCookieOptions();
      res.cookie("accessToken", newAccessToken, accessCookieOptions);
    }

    return sendOk(res, { user });
  } catch (err) {
    next(err);
  }
};

// USED TO LOGOUT
const Logout = async (req, res, next) => {
  try {
    const tokenFromCookie = req.cookies?.refreshToken;
    const tokenFromBody = req.body?.refreshToken;
    const refreshToken = tokenFromBody || tokenFromCookie;

    await authService.Logout({
      refreshToken,
      userId: req.user?.id, // req.user may be undefined if you allow unauth logout
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    // Clear cookie
    res.clearCookie("refreshToken", {
      path: "/",
    });
    // Clear access token cookie as well (may be present)
    res.clearCookie("accessToken", {
      path: "/",
    });

    return sendNoContent(res);
  } catch (err) {
    next(err);
  }
};

// USED TO REQUEST PASSWORD CHANGE SEND EMAIL
const ForgotPassword = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { email } = body;

    if (!email) {
      return sendErr(res, {
        message: EMAIL_REQUIRED,
        statusCode: 400,
      });
    }

    const result = await authService.ForgotPassword({
      email,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      return sendErr(res, {
        message: result.message,
        statusCode: 400,
      });
    }

    // Return explicit shape: message, success, data
    return res
      .status(200)
      .json({ message: result.message, success: true, data: null });
  } catch (err) {
    next(err);
  }
};

// USED TO VERIFY RESET PASSWORD TOKEN
const VerifyResetPasswordToken = async (req, res, next) => {
  try {
    const { token } = req.query;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: TOKEN_REQUIRED,
        data: null,
      });
    }

    const result = await authService.VerifyResetPasswordToken(token);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message,
        data: result.data ?? null,
      });
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      data: null,
    });
  } catch (err) {
    next(err);
  }
};

// USED TO RESET PASSWORD
const ResetPassword = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { token, newPassword } = body;

    if (!token || !newPassword) {
      return sendErr(res, {
        message: "Token and newPassword are required",
        statusCode: 400,
      });
    }

    const result = await authService.ResetPassword({
      token,
      newPassword,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      const reason = result.data?.reason;
      const statusCode = reason === "USER_NOT_FOUND" ? 404 : 400;
      return sendErr(res, {
        message: result.message,
        statusCode,
      });
    }

    // Explicit shape: message, success, data
    return res
      .status(200)
      .json({ message: result.message, success: true, data: null });
  } catch (err) {
    next(err);
  }
};

// USED TO CHANGE PASSWORD IN APP (Authenticated)
const ChangePassword = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return sendErr(res, {
        message: CURRENT_PASSWORD_AND_NEW_PASSWORD_REQUIRED,
        statusCode: 400,
      });
    }

    const result = await authService.ChangePassword({
      userId: req.user.id,
      currentPassword,
      newPassword,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      const reason = result.data?.reason;
      const statusCode = reason === "USER_NOT_FOUND" ? 404 : 400;
      return sendErr(res, {
        message: result.message,
        statusCode,
      });
    }

    // Explicit shape: message, success, data
    return res
      .status(200)
      .json({ message: result.message, success: true, data: null });
  } catch (err) {
    next(err);
  }
};

// USED TO TOGGLE 2 FACTOR AUTHENTICATION (Authenticated)
const Toggle2FA = async (req, res, next) => {
  try {
    const result = await authService.Enable2FA({
      userId: req.user.id,
      body: req.body || {},
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      return sendErr(res, {
        message: result.message,
        statusCode: 401,
      });
    }
    return sendOk(res, result.data);
  } catch (err) {
    next(err);
  }
};

// USED TO VERIFY 2FA CODE AND COMPLETE LOGIN
const Verify2FA = async (req, res, next) => {
  try {
    const body = req.body || {};
    const { tempToken, code } = body;

    const result = await authService.Verify2FA({
      tempToken,
      code,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
    });

    if (!result.success) {
      return sendErr(res, {
        statusCode: 401,
        message: result.message,
      });
    }

    const { user, accessToken, refreshToken, rememberMe } = result.data || {};

    if (refreshToken) {
      res.cookie(
        "refreshToken",
        refreshToken,
        getRefreshTokenCookieOptions(rememberMe),
      );
    }
    if (accessToken) {
      res.cookie("accessToken", accessToken, getAccessTokenCookieOptions());
    }

    return sendOk(res, { user });
  } catch (err) {
    next(err);
  }
};

// USED TO REVOKE A SESSION (Authenticated)
const RevokeSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params || {};

    if (!sessionId) {
      return sendErr(res, {
        statusCode: 400,
        message: SESSION_ID_REQUIRED,
      });
    }

    if (!mongoose.Types.ObjectId.isValid(String(sessionId))) {
      return sendErr(res, {
        statusCode: 400,
        message: "Invalid session ID",
      });
    }

    // optional: prevent revoking current session (up to you)
    const currentSessionId = getCurrentSessionIdFromRequest(req);
    if (currentSessionId && String(currentSessionId) === String(sessionId)) {
      return sendErr(res, {
        statusCode: 400,
        message: "Cannot revoke current session from this endpoint",
      });
    }

    const result = await authService.RevokeSession({
      userId: req.user.id,
      sessionId,
    });

    if (!result.success) {
      const statusCode =
        result.data?.reason === "SESSION_NOT_FOUND" ? 404 : 400;

      return sendErr(res, {
        statusCode,
        message: result.message,
      });
    }

    return sendOk(res, { revoked: true });
  } catch (err) {
    next(err);
  }
};

// USED TO REVOKE ALL OTHER SESSIONS (Authenticated)
const RevokeOtherSessions = async (req, res, next) => {
  try {
    const currentSessionId = getCurrentSessionIdFromRequest(req);

    const result = await authService.RevokeOtherSessions({
      userId: req.user.id,
      currentSessionId,
    });

    if (!result.success) {
      return sendErr(res, {
        statusCode: 400,
        message: result.message,
      });
    }

    return sendOk(res, { revoked: result.data.revoked });
  } catch (err) {
    next(err);
  }
};

// USED TO UPDATE USER STATUS (Authenticated, requires users.update permission)
const UpdateUserStatus = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { status } = req.body;

    const result = await authService.UpdateUserStatus({
      targetUserId: userId,
      status,
      actorUserId: req.user.id,
    });

    if (!result.success) {
      return sendErr(res, {
        statusCode: result.statusCode || 400,
        message: result.message,
      });
    }

    return sendOk(res, { user: result.data.user });
  } catch (err) {
    next(err);
  }
};

// ========================= ACCESS CONTROL (ROLES & PERMISSIONS) =========================

// USED TO LIST USERS WITH FILTERS (Authenticated, requires users.read permission)
const ListUsers = async (req, res, next) => {
  try {
    const { page = 1, pageSize = 20, status, role, search } = req.query;

    const result = await authService.ListUsers({
      page: Number(page),
      pageSize: Number(pageSize),
      status,
      role,
      search,
    });

    if (!result.success) {
      return sendErr(res, {
        statusCode: result.statusCode,
        message: result.message,
      });
    }

    return sendOk(res, result.data, {
      meta: result.meta,
    });
  } catch (err) {
    next(err);
  }
};

// USED TO GET ALL ROLES (Authenticated, requires access.read permission)
const UpdateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const result = await authService.UpdateUser({
      targetUserId: userId,
      updates: req.body,
      actorUserId: req.user.id,
    });

    if (!result.success) {
      return sendErr(res, {
        statusCode: result.statusCode,
        message: result.message,
      });
    }

    return sendOk(res, { user: result.data.user });
  } catch (err) {
    next(err);
  }
};

// USED TO GET USER BY ID (Authenticated, requires users.read permission)
const GetUserById = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const result = await authService.GetUserById({
      targetUserId: userId,
      requesterUserId: req.user.id,
    });

    if (!result.success) {
      return sendErr(res, {
        statusCode: result.statusCode,
        message: result.message,
      });
    }

    return sendOk(res, { user: result.data.user });
  } catch (err) {
    next(err);
  }
};

// ========================= UTILS =========================

const getRefreshTokenCookieOptions = (rememberMe = false) => {
  const isProduction = process.env.NODE_ENV === "production";

  // If rememberMe = true, longer expiry; otherwise session-ish.
  // NOTE: actual expiry enforcement should also live in DB/session.
  const maxAge = rememberMe
    ? 30 * 24 * 60 * 60 * 1000 // 30 days
    : 24 * 60 * 60 * 1000; // 1 day

  return {
    httpOnly: true,
    secure: isProduction, // true on prod (HTTPS), false for local dev
    sameSite: "lax",
    path: "/",
    maxAge,
  };
};

const parseExpiryToMs = (str) => {
  if (!str || typeof str !== "string") return 15 * 60 * 1000;
  const m = str.match(/^(\d+)(s|m|h|d)$/);
  if (!m) return 15 * 60 * 1000;
  const n = Number(m[1]);
  const unit = m[2];
  switch (unit) {
    case "s":
      return n * 1000;
    case "m":
      return n * 60 * 1000;
    case "h":
      return n * 60 * 60 * 1000;
    case "d":
      return n * 24 * 60 * 60 * 1000;
    default:
      return 15 * 60 * 1000;
  }
};

const getAccessTokenCookieOptions = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const defaultExpiry = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
  const maxAge = parseExpiryToMs(defaultExpiry);

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/", // sent on all API requests
    maxAge,
  };
};

const getCurrentSessionIdFromRequest = (req) => {
  const rt = req.cookies?.refreshToken;
  if (!rt) return null;

  try {
    const payload = jwtUtil.verifyRefreshToken(rt);
    return payload?.sid || null;
  } catch {
    return null;
  }
};

module.exports = {
  Login,
  RefreshToken,
  Logout,
  ForgotPassword,
  ResetPassword,
  ChangePassword,
  Toggle2FA,
  Verify2FA,
  CheckAuth,
  VerifyResetPasswordToken,
  GetAuthenticatedUser,
  GetSessions,
  RevokeOtherSessions,
  RevokeSession,
  UpdateUserStatus,
  GetUserById,
  ListUsers,
  UpdateUser,
};
