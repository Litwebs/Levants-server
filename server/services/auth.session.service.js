"use strict";

const User = require("../models/user.model");
const Session = require("../models/session.model");
const {
  USER_NOT_FOUND,
  USER_ID_REQUIRED,
  INVALID_OR_EXPIRED_SESSION,
  SESSION_REVOKED,
  SESSION_NOT_FOUND,
  SESSION_ID_REQUIRED,
  OK,
} = require("../constants/Auth.constants");
const { Response } = require("../utils/response.util");
const { sanitizeUser } = require("../utils/authUser.util");
const { sessionLabelFromUserAgent } = require("../utils/authSession.util");

const GetAuthenticatedUser = async ({ userId }) => {
  const user = await User.findById(userId).populate("role");
  if (!user) {
    return Response(false, USER_NOT_FOUND, null);
  }

  return Response(true, OK, { user: sanitizeUser(user) });
};

const GetSessions = async ({ userId, currentSessionId }) => {
  if (!userId) {
    return Response(false, USER_ID_REQUIRED, null);
  }

  const now = new Date();
  const rows = await Session.find({
    user: userId,
    expiresAt: { $gt: now },
    revokedAt: null,
  })
    .select("-refreshTokenHash")
    .sort({ updatedAt: -1 })
    .lean();

  const sessions = rows.map((s) => ({
    _id: String(s._id),
    user: String(s.user),
    userAgent: s.userAgent || null,

    // ✅ pretty label for UI (no DB changes)
    label: sessionLabelFromUserAgent(s.userAgent, s.ip),

    ip: s.ip || null,
    expiresAt: s.expiresAt,
    revokedAt: s.revokedAt || null,
    revokedReason: s.revokedReason || null,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    isCurrent: currentSessionId
      ? String(s._id) === String(currentSessionId)
      : false,
  }));

  return Response(true, OK, { sessions });
};

const RevokeOtherSessions = async ({ userId, currentSessionId }) => {
  if (!userId) {
    return Response(false, USER_ID_REQUIRED, null);
  }

  const now = new Date();

  const filter = {
    user: userId,
    revokedAt: null,
    expiresAt: { $gt: now },
  };

  if (currentSessionId) {
    filter._id = { $ne: currentSessionId };
  }

  const result = await Session.updateMany(filter, {
    $set: {
      revokedAt: now,
      revokedReason: "REVOKE_OTHERS",
    },
  });

  const revoked =
    typeof result.modifiedCount === "number"
      ? result.modifiedCount
      : result.nModified || 0;

  return Response(true, SESSION_REVOKED, { revoked });
};

const RevokeSession = async ({ userId, sessionId }) => {
  if (!userId) {
    return Response(false, USER_ID_REQUIRED, null);
  }
  if (!sessionId) {
    return Response(false, SESSION_ID_REQUIRED, null);
  }

  const now = new Date();

  // Ensure: session belongs to user and is active
  const session = await Session.findOne({
    _id: sessionId,
    user: userId,
    revokedAt: null,
  });

  if (!session) {
    return Response(false, SESSION_NOT_FOUND, { reason: "SESSION_NOT_FOUND" });
  }

  session.revokedAt = now;
  session.revokedReason = "USER_REVOKE";
  await session.save();

  return Response(true, SESSION_REVOKED, null);
};

module.exports = {
  GetAuthenticatedUser,
  GetSessions,
  RevokeOtherSessions,
  RevokeSession,
};
