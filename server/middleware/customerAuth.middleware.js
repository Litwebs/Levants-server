"use strict";

const jwtUtil = require("../utils/jwt.util");
const Customer = require("../models/customer.model");

function getTokenFromRequest(req) {
  // Prefer Authorization header
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && typeof authHeader === "string") {
    const [scheme, token] = authHeader.split(" ");
    if (scheme === "Bearer" && token) return token.trim();
  }

  // Cookie fallback
  if (req.cookies && req.cookies.customerAccessToken) {
    return req.cookies.customerAccessToken;
  }

  return null;
}

/**
 * requireCustomerAuth
 * Validates a customer JWT and attaches req.customer.
 * Ensures only registered (non-guest) active customers can access portal routes.
 */
const requireCustomerAuth = async (req, res, next) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    return next({ statusCode: 401, message: "Authentication required" });
  }

  let payload;
  try {
    payload = jwtUtil.verifyCustomerAccessToken(token);
  } catch {
    return next({ statusCode: 401, message: "Invalid or expired token" });
  }

  const customer = await Customer.findById(payload.sub).select(
    "-passwordHash -passwordResetTokenHash -passwordResetTokenExpiresAt",
  );

  if (!customer) {
    return next({ statusCode: 401, message: "Customer account not found" });
  }

  if (customer.isGuest) {
    return next({
      statusCode: 403,
      message: "Portal access requires a registered account",
    });
  }

  if (customer.status === "disabled") {
    return next({ statusCode: 403, message: "Account is disabled" });
  }

  req.customer = customer;
  return next();
};

/**
 * optionalCustomerAuth
 * Attaches req.customer if a valid token is present, otherwise continues.
 */
const optionalCustomerAuth = async (req, res, next) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    req.customer = null;
    return next();
  }

  try {
    const payload = jwtUtil.verifyCustomerAccessToken(token);
    const customer = await Customer.findById(payload.sub).select(
      "-passwordHash -passwordResetTokenHash -passwordResetTokenExpiresAt",
    );

    if (customer && !customer.isGuest && customer.status === "active") {
      req.customer = customer;
    } else {
      req.customer = null;
    }
  } catch {
    req.customer = null;
  }

  return next();
};

module.exports = { requireCustomerAuth, optionalCustomerAuth };
