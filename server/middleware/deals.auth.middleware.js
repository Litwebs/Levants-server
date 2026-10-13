const { verifyAccessToken } = require("../utils/jwt.util");
const { requireAuth } = require("./auth.middleware");

// Customer and temporary tokens may share the access signing secret. Restrict
// their purpose on deals routes without changing existing UAT authentication.
function requireDealsAdminAuth(req, res, next) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const [scheme, bearer] = typeof header === "string" ? header.split(" ") : [];
  const token = req.cookies?.accessToken ||
    (scheme === "Bearer" && bearer ? bearer.trim() : null);
  if (!token) return requireAuth(req, res, next);

  try {
    const payload = verifyAccessToken(token);
    if ((payload.type && payload.type !== "admin") ||
        (payload.tokenType && payload.tokenType !== "access")) {
      return next({ statusCode: 401, message: "Administrator access token required" });
    }
  } catch (_) {
    return next({ statusCode: 401, message: "Invalid or expired token" });
  }
  return requireAuth(req, res, next);
}

module.exports = { requireDealsAdminAuth };
