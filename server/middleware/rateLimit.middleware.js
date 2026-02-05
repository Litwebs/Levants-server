const rateLimit = require("express-rate-limit");
const { sendErr } = require("../utils/response.util");

// Helper to safely read integer env vars
function intFromEnv(name, defaultValue) {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const num = Number(raw);
  return Number.isNaN(num) ? defaultValue : num;
}

// Default windows (ms)
const DEFAULT_LOGIN_WINDOW_MS = intFromEnv(
  "RATE_LIMIT_LOGIN_WINDOW_MS",
  15 * 60 * 1000,
); // 15 mins
const DEFAULT_LOGIN_MAX = intFromEnv("RATE_LIMIT_LOGIN_MAX", 7);

const DEFAULT_AUTH_WINDOW_MS = intFromEnv(
  "RATE_LIMIT_AUTH_WINDOW_MS",
  15 * 60 * 1000,
); // 15 mins
const DEFAULT_AUTH_MAX = intFromEnv("RATE_LIMIT_AUTH_MAX", 7);

const DEFAULT_API_WINDOW_MS = intFromEnv("RATE_LIMIT_API_WINDOW_MS", 60 * 1000); // 1 min
const DEFAULT_API_MAX = intFromEnv("RATE_LIMIT_API_MAX", 5);

// Contact form submissions (public)
const DEFAULT_SUBMISSIONS_WINDOW_MS = intFromEnv(
  "RATE_LIMIT_SUBMISSIONS_WINDOW_MS",
  10 * 60 * 1000,
); // 10 mins
const DEFAULT_SUBMISSIONS_MAX = intFromEnv("RATE_LIMIT_SUBMISSIONS_MAX", 20);

const DEFAULT_ANALYTICS_WINDOW_MS = intFromEnv(
  "RATE_LIMIT_ANALYTICS_WINDOW_MS",
  60 * 1000,
); // 1 min

const DEFAULT_ANALYTICS_MAX = intFromEnv("RATE_LIMIT_ANALYTICS_MAX", 300);

/**
 * Shared handler to keep error format consistent with response.util.
 */
function rateLimitHandler(req, res, _next, options) {
  const retrySecs = Math.ceil((options.windowMs || 0) / 1000);

  if (!res.headersSent && retrySecs > 0) {
    res.setHeader("Retry-After", retrySecs.toString());
  }

  const DEFAULT_MSG =
    "Too many requests, please slow down and try again shortly.";
  const GENERIC_SHORT_MSG = "Too many requests, please slow down.";

  const optionMessage =
    typeof options?.message === "string" ? options.message.trim() : "";
  const message =
    !optionMessage || optionMessage === GENERIC_SHORT_MSG
      ? DEFAULT_MSG
      : optionMessage;

  const status = Number(options?.statusCode) || 429;
  const code = "TOO_MANY_REQUESTS";

  if (res.headersSent) return;

  return res.status(status).json({
    success: false,
    code,
    message,
    data: null,
    error: {
      code,
      message,
      data: null,
    },
  });
}

/**
 * Generic factory if you ever want custom limiters in routes.
 */
function createRateLimiter({ windowMs, max, message, keyGenerator, skip }) {
  const options = {
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message,
    handler: rateLimitHandler,
  };

  // Only set these if provided – otherwise use library defaults
  if (typeof keyGenerator === "function") {
    options.keyGenerator = keyGenerator;
  }
  if (typeof skip === "function") {
    options.skip = skip;
  }

  return rateLimit(options);
}

/**
 * Stricter limiter for login / auth endpoints
 */
const loginLimiter = createRateLimiter({
  windowMs: DEFAULT_LOGIN_WINDOW_MS,
  max: DEFAULT_LOGIN_MAX,
  message: "Too many login attempts, please try again later.",
});

/**
 * General limiter for authenticated routes.
 */
const authLimiter = createRateLimiter({
  windowMs: DEFAULT_AUTH_WINDOW_MS,
  max: DEFAULT_AUTH_MAX,
});

/**
 * Default limiter for public API endpoints.
 */
const apiLimiter = createRateLimiter({
  windowMs: DEFAULT_API_WINDOW_MS,
  max: DEFAULT_API_MAX,
});

/**
 * Limiter for public contact form submissions
 */
const submissionsLimiter = createRateLimiter({
  windowMs: DEFAULT_SUBMISSIONS_WINDOW_MS,
  max: DEFAULT_SUBMISSIONS_MAX,
  message: "Too many form submissions, please try again later.",
});

/**
 * Collector limiter for website analytics ingestion.
 * Higher than normal API because the site may send events frequently.
 */
const analyticsCollectLimiter = createRateLimiter({
  windowMs: DEFAULT_ANALYTICS_WINDOW_MS,
  max: DEFAULT_ANALYTICS_MAX,
  message: "Too many analytics events, please slow down.",
});

module.exports = {
  createRateLimiter,
  loginLimiter,
  authLimiter,
  apiLimiter,
  submissionsLimiter,
  analyticsCollectLimiter,
};
