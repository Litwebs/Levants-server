// Loaded before test files are evaluated.
// Important: jwt.util reads secrets at import time.

process.env.NODE_ENV = "test";

process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
process.env.JWT_2FA_SECRET = process.env.JWT_2FA_SECRET || "test-2fa-secret";

process.env.JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || "15m";
process.env.JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || "7d";
process.env.JWT_2FA_EXPIRES_IN = process.env.JWT_2FA_EXPIRES_IN || "10m";

process.env.PASSWORD_SALT_ROUNDS = process.env.PASSWORD_SALT_ROUNDS || "4";

// Prevent express-rate-limit from causing flaky E2E tests.
process.env.RATE_LIMIT_LOGIN_MAX = process.env.RATE_LIMIT_LOGIN_MAX || "1000";
process.env.RATE_LIMIT_LOGIN_WINDOW_MS =
  process.env.RATE_LIMIT_LOGIN_WINDOW_MS || String(15 * 60 * 1000);

process.env.RATE_LIMIT_API_MAX = process.env.RATE_LIMIT_API_MAX || "10000";
process.env.RATE_LIMIT_API_WINDOW_MS =
  process.env.RATE_LIMIT_API_WINDOW_MS || String(60 * 1000);

process.env.RATE_LIMIT_AUTH_MAX = process.env.RATE_LIMIT_AUTH_MAX || "10000";
process.env.RATE_LIMIT_AUTH_WINDOW_MS =
  process.env.RATE_LIMIT_AUTH_WINDOW_MS || String(15 * 60 * 1000);

// Used to build reset links; irrelevant for tests but required.
process.env.FRONTEND_URL_DEV =
  process.env.FRONTEND_URL_DEV || "http://localhost:3000";
