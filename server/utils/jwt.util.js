// src/utils/jwt.util.js
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

// Optional separate secret for temp 2FA tokens (recommended)
const TWOFA_SECRET = process.env.JWT_2FA_SECRET || ACCESS_SECRET;

const ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN;
const REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN;

function buildPayload(user) {
  const id = user._id || user.id;
  return {
    sub: String(id),
    role: user.role,
  };
}

function signAccessToken(user) {
  const payload = {
    ...buildPayload(user),
    // Ensure tokens issued close together aren't identical
    jti: crypto.randomBytes(16).toString("hex"),
  };
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_EXPIRES_IN });
}

function signRefreshToken(user, { rememberMe = false, sessionId } = {}) {
  if (!sessionId)
    throw new Error("sessionId is required to sign refresh token");

  const payload = {
    ...buildPayload(user),
    rememberMe,
    tokenType: "refresh",
    sid: String(sessionId),
    // Ensure each rotation produces a different token
    jti: crypto.randomBytes(16).toString("hex"),
  };

  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: REFRESH_EXPIRES_IN });
}

function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  const decoded = jwt.verify(token, REFRESH_SECRET);

  if (decoded.tokenType !== "refresh") {
    const err = new Error("Invalid refresh token type");
    err.name = "JsonWebTokenError";
    throw err;
  }

  if (!decoded.sid) {
    const err = new Error("Refresh token missing session id");
    err.name = "JsonWebTokenError";
    throw err;
  }

  return decoded;
}

// ✅ 2FA temp token
function sign2FATempToken(user, { rememberMe = false } = {}) {
  const payload = {
    ...buildPayload(user),
    tokenType: "2fa",
    rememberMe,
    jti: crypto.randomBytes(16).toString("hex"),
  };

  // keep short-lived
  const expiresIn = process.env.JWT_2FA_EXPIRES_IN || "10m";
  return jwt.sign(payload, TWOFA_SECRET, { expiresIn });
}

function verify2FATempToken(token) {
  const decoded = jwt.verify(token, TWOFA_SECRET);
  if (decoded.tokenType !== "2fa") {
    const err = new Error("Invalid 2FA temp token type");
    err.name = "JsonWebTokenError";
    throw err;
  }
  return decoded;
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,

  // 2FA temp token helpers
  sign2FATempToken,
  verify2FATempToken,
};
