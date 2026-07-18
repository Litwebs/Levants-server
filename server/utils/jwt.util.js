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

  const roleClaim =
    user && user.role && typeof user.role === "object" && user.role.name
      ? user.role.name
      : user.role;

  return {
    sub: String(id),
    role: roleClaim,
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

// ===== Customer portal tokens =====
const CUSTOMER_ACCESS_SECRET =
  process.env.JWT_CUSTOMER_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET;
const CUSTOMER_REFRESH_SECRET =
  process.env.JWT_CUSTOMER_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET;
const CUSTOMER_ACCESS_EXPIRES_IN =
  process.env.JWT_CUSTOMER_ACCESS_EXPIRES_IN ||
  process.env.JWT_ACCESS_EXPIRES_IN ||
  "15m";
const CUSTOMER_REFRESH_EXPIRES_IN =
  process.env.JWT_CUSTOMER_REFRESH_EXPIRES_IN ||
  process.env.JWT_REFRESH_EXPIRES_IN ||
  "30d";

function signCustomerAccessToken(customer) {
  const payload = {
    sub: String(customer._id || customer.id),
    type: "customer",
    jti: crypto.randomBytes(16).toString("hex"),
  };
  return jwt.sign(payload, CUSTOMER_ACCESS_SECRET, {
    expiresIn: CUSTOMER_ACCESS_EXPIRES_IN,
  });
}

function signCustomerRefreshToken(customer, { sessionId } = {}) {
  if (!sessionId)
    throw new Error("sessionId is required for customer refresh token");
  const payload = {
    sub: String(customer._id || customer.id),
    type: "customer",
    tokenType: "refresh",
    sid: String(sessionId),
    jti: crypto.randomBytes(16).toString("hex"),
  };
  return jwt.sign(payload, CUSTOMER_REFRESH_SECRET, {
    expiresIn: CUSTOMER_REFRESH_EXPIRES_IN,
  });
}

function verifyCustomerAccessToken(token) {
  const decoded = jwt.verify(token, CUSTOMER_ACCESS_SECRET);
  if (decoded.type !== "customer") {
    const err = new Error("Invalid customer token type");
    err.name = "JsonWebTokenError";
    throw err;
  }
  return decoded;
}

function verifyCustomerRefreshToken(token) {
  const decoded = jwt.verify(token, CUSTOMER_REFRESH_SECRET);
  if (decoded.type !== "customer" || decoded.tokenType !== "refresh") {
    const err = new Error("Invalid customer refresh token");
    err.name = "JsonWebTokenError";
    throw err;
  }
  if (!decoded.sid) {
    const err = new Error("Customer refresh token missing session id");
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
  sign2FATempToken,
  verify2FATempToken,
  // Customer portal tokens
  signCustomerAccessToken,
  signCustomerRefreshToken,
  verifyCustomerAccessToken,
  verifyCustomerRefreshToken,
};
