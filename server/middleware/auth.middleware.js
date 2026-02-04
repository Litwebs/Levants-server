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

    const user = await User.findById(payload.sub);
    if (!user) {
      return {
        user: null,
        error: {
          statusCode: 401,
          message: "User not found for this token",
        },
      };
    }

    if (user.status === "disabled" || user.archived) {
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
        id: user._id.toString(),
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
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
