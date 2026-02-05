const jwtUtil = require("../utils/jwt.util");
const User = require("../models/user.model");

const getAccessTokenFromRequest = (req) => {
  if (req.cookies && req.cookies.accessToken) {
    return req.cookies.accessToken;
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && typeof authHeader === "string") {
    const [scheme, token] = authHeader.split(" ");
    if (scheme === "Bearer" && token) {
      return token.trim();
    }
  }

  return null;
};

const resolveUserFromToken = async (token) => {
  try {
    const payload = jwtUtil.verifyAccessToken(token);

    const userDoc = await User.findById(payload.sub).populate(
      "role",
      "name permissions",
    );

    if (!userDoc) {
      return {
        user: null,
        error: {
          statusCode: 401,
          message: "User not found for this token",
        },
      };
    }

    if (userDoc.status === "disabled" || userDoc.archived) {
      return {
        user: null,
        error: {
          statusCode: 403,
          message: "User account is disabled",
        },
      };
    }

    return {
      user: {
        id: userDoc._id.toString(),
        _id: userDoc._id,
        name: userDoc.name,
        email: userDoc.email,
        role: userDoc.role, // ✅ populated role
        status: userDoc.status,
      },
      error: null,
    };
  } catch (e) {
    return {
      user: null,
      error: {
        statusCode: 401,
        message: "Invalid or expired token",
      },
    };
  }
};

const requireAuth = async (req, res, next) => {
  const token = getAccessTokenFromRequest(req);
  if (!token) {
    return next({
      statusCode: 401,
      message: "Authentication required",
    });
  }

  const { user, error } = await resolveUserFromToken(token);
  if (error) {
    return next(error);
  }

  req.user = user;
  return next();
};

const optionalAuth = async (req, res, next) => {
  const token = getAccessTokenFromRequest(req);
  if (!token) {
    req.user = null;
    return next();
  }

  const { user, error } = await resolveUserFromToken(token);
  if (error) {
    return next(error);
  }

  req.user = user;
  return next();
};

module.exports = {
  requireAuth,
  optionalAuth,
};
