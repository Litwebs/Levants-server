// e.g. src/constants/auth.messages.js

const INVALID_EMAIL_OR_PASSWORD = "Invalid email or password.";
const INVALID_OR_EXPIRED_SESSION = "Invalid or expired session.";
const INVALID_RESET_PASSWORD_TOKEN = "Invalid or expired reset password token.";
const INVALID_OR_EXPIRED_TOKEN = "Invalid or expired token.";
const INVALID_CODE = "Invalid code.";

const SESSION_REVOKED = "Session revoked successfully.";
const SESSION_NOT_FOUND = "Session not found.";
const SESSION_ID_REQUIRED = "Session ID is required.";

const TOKEN_VERIFIED = "Authentication token verified successfully.";
const TOKEN_REQUIRED = "Authentication token is required.";
const TOKEN_GENERATED = "Authentication token generated successfully.";
const TOKEN_AND_CODE_REQUIRED =
  "Both token and code are required for 2FA verification.";

const EMAIL_ALREADY_IN_USE = "Email is already in use.";
const USER_NOT_FOUND = "User not found.";
const ACCOUNT_DISABLED = "Account is disabled.";
const LOGIN_SUCCESSFUL = "Login successful.";
const NO_ACTIVE_2FA_SESSION = "No active 2FA session found.";
const MAX_ATTEMPTS = 6;
const TOO_MANY_ATTEMPTS = "Too many attempts. Please try again later.";
const LOGGED_OUT = "Successfully logged out.";
const IF_ACCOUNT_EXISTS =
  "If an account with that email exists, a password reset link has been sent.";

const _2FA_CODE_USED = "The 2FA code has already been used.";
const _2FA_CODE_VALIDATED = "2FA code validated successfully.";
const _2FA_CODE_SENT = "A 2FA code has been sent to your email.";

const PASSWORD_RESET_SUCCESSFUL = "Password has been reset successfully.";

const CURRENT_PASSWORD_INCORRECT = "Current password is incorrect.";
const NEW_PASSWORD_MUST_BE_DIFFERENT =
  "New password must be different from current password.";
const PASSWORD_CHANGED_SUCCESSFULLY = "Password changed successfully.";
const CURRENT_PASSWORD_AND_NEW_PASSWORD_REQUIRED =
  "Current password and new password are required.";

const USER_AUTHENTICATED = "User authenticated successfully.";
const USER_ID_REQUIRED = "User ID is required.";
const OK = "OK";

const EMAIL_REQUIRED = "Email is required.";

// src/constants/auth.constants.js

const PERMISSIONS = [
  // =========================
  // Orders
  // =========================
  "orders.create",
  "orders.read",
  "orders.update",
  "orders.delete",
  "orders.refund",

  // =========================
  // Products
  // =========================
  "products.create",
  "products.read",
  "products.update",
  "products.delete",
  "products.publish",

  "variants.create",
  "variants.update",
  "variants.delete",

  "stock.update",
  // =========================
  // Customers
  // =========================
  "customers.create",
  "customers.read",
  "customers.update",
  "customers.delete",

  // =========================
  // Delivery / Routes
  // =========================
  "delivery.routes.create",
  "delivery.routes.read",
  "delivery.routes.update",
  "delivery.routes.delete",

  // =========================
  // Promotions
  // =========================
  "promotions.create",
  "promotions.read",
  "promotions.update",
  "promotions.delete",

  // =========================
  // Business Info
  // =========================
  "business.info.read",
  "business.info.update",

  // =========================
  // Audit
  // =========================
  "audit.read",
  "analytics.read",

  // =========================
  // Users / Auth
  // =========================
  "users.read",
  "users.update",
  "users.status.update", // ✅ enable / disable users
  "users.roles.update", // ✅ assign roles
];

module.exports = {
  PERMISSIONS,
  INVALID_EMAIL_OR_PASSWORD,
  INVALID_OR_EXPIRED_SESSION,
  INVALID_RESET_PASSWORD_TOKEN,
  INVALID_OR_EXPIRED_TOKEN,
  INVALID_CODE,

  SESSION_REVOKED,
  SESSION_NOT_FOUND,

  TOKEN_VERIFIED,
  TOKEN_REQUIRED,
  TOKEN_GENERATED,
  TOKEN_AND_CODE_REQUIRED,

  EMAIL_ALREADY_IN_USE,
  USER_NOT_FOUND,
  ACCOUNT_DISABLED,
  LOGIN_SUCCESSFUL,
  NO_ACTIVE_2FA_SESSION,
  MAX_ATTEMPTS,
  TOO_MANY_ATTEMPTS,
  LOGGED_OUT,
  IF_ACCOUNT_EXISTS,

  _2FA_CODE_USED,
  _2FA_CODE_VALIDATED,
  _2FA_CODE_SENT,

  PASSWORD_RESET_SUCCESSFUL,

  CURRENT_PASSWORD_INCORRECT,
  NEW_PASSWORD_MUST_BE_DIFFERENT,
  PASSWORD_CHANGED_SUCCESSFULLY,

  SESSION_ID_REQUIRED,
  USER_AUTHENTICATED,
  USER_ID_REQUIRED,
  OK,
  EMAIL_REQUIRED,
};
