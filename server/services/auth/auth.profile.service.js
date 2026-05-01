"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("../../models/user.model");
const Session = require("../../models/session.model");
const cryptoUtil = require("../../utils/crypto.util");
const sendEmail = require("../../Integration/Email.service");
const { Response } = require("../../utils/response.util");
const { sanitizeUser } = require("../../utils/authUser.util");
const {
  buildVerifyEmailLink,
  buildSecurityUrl,
} = require("../../utils/authLinks.util");

const UpdateSelf = async ({ userId, updates }, options = {}) => {
  const { updatedBy } = options;

  const user = await User.findById(userId).select("+pendingEmailTokenHash");
  if (!user) {
    return {
      success: false,
      statusCode: 404,
      message: "User not found",
    };
  }

  // =========================
  // FIELD RULES (SELF)
  // =========================
  const allowedFields = new Set(["name", "email", "avatarUrl", "preferences"]);

  const forbiddenFields = new Set([
    "_id",
    "id",
    "role",
    "status",
    "archived",
    "passwordHash",
    "createdAt",
    "updatedAt",
  ]);

  Object.keys(updates).forEach((key) => {
    if (forbiddenFields.has(key) || !allowedFields.has(key)) {
      delete updates[key];
    }
  });

  // =========================
  // EMAIL CHANGE (SELF)
  // =========================
  let emailChangeInitiated = false;

  if (typeof updates.email === "string") {
    const nextEmail = updates.email.trim().toLowerCase();

    if (!nextEmail || nextEmail === user.email) {
      delete updates.email;
    } else {
      const okFormat =
        nextEmail.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail);

      if (!okFormat) {
        return {
          success: false,
          statusCode: 400,
          message: "Invalid email address",
        };
      }

      const existing = await User.findOne({
        _id: { $ne: user._id },
        email: nextEmail,
      }).lean();

      if (existing) {
        return {
          success: false,
          statusCode: 409,
          message: "A user with that email already exists",
        };
      }

      const rawToken = crypto.randomBytes(32).toString("hex");

      user.pendingEmail = nextEmail;
      user.pendingEmailTokenHash = cryptoUtil.hashToken(rawToken);
      user.pendingEmailTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

      emailChangeInitiated = true;
      delete updates.email;

      const verifyLink = buildVerifyEmailLink(user._id, rawToken);

      if (!verifyLink) {
        console.error(
          "[email-change] missing FRONTEND_URL_PROD/FRONTEND_URL_DEV; cannot build verify link",
          { userId: user._id.toString(), email: nextEmail },
        );
      } else {
        await sendEmail(
          nextEmail,
          "Confirm your new email",
          "verifyEmailChange",
          {
            name: user.name,
            verifyLink,
            expiresInMinutes: 60,
          },
        );
      }
    }
  }

  // =========================
  // SAFE PREFERENCES MERGE
  // =========================
  if (updates.preferences) {
    if (updates.preferences.theme !== undefined) {
      user.set("preferences.theme", updates.preferences.theme);
    }

    if (updates.preferences.language !== undefined) {
      user.set("preferences.language", updates.preferences.language);
    }

    if (updates.preferences.notifications) {
      const existing =
        user.preferences?.notifications?.toObject?.() ||
        user.preferences?.notifications ||
        {};

      user.set("preferences.notifications", {
        ...existing,
        ...updates.preferences.notifications,
      });
    }

    delete updates.preferences;
  }

  // =========================
  // APPLY REMAINING UPDATES
  // =========================
  Object.assign(user, updates, { updatedBy });

  const saved = await user.save();
  const out = sanitizeUser(saved);

  if (emailChangeInitiated) {
    out.emailChange = {
      pending: true,
      pendingEmail: saved.pendingEmail,
      expiresAt: saved.pendingEmailTokenExpiresAt,
    };
  }

  return {
    success: true,
    data: { user: out },
    emailChangeInitiated,
  };
};

const confirmEmailChange = async ({ userId, token }) => {
  if (!mongoose.Types.ObjectId.isValid(String(userId || ""))) {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid userId",
      data: null,
    };
  }

  const user = await User.findById(userId).select("+pendingEmailTokenHash");
  if (!user) {
    return {
      success: false,
      statusCode: 404,
      message: "User not found",
      data: null,
    };
  }

  if (user.status === "disabled" || user.archived) {
    return {
      success: false,
      message: "User not found or inactive",
      data: null,
    };
  }

  if (!user.pendingEmail || !user.pendingEmailTokenHash) {
    return {
      success: false,
      statusCode: 400,
      message: "No pending email change",
      data: null,
    };
  }

  if (
    !user.pendingEmailTokenExpiresAt ||
    user.pendingEmailTokenExpiresAt < new Date()
  ) {
    return {
      success: false,
      statusCode: 400,
      message: "Verification token expired",
      data: null,
    };
  }

  const tokenHash = cryptoUtil.hashToken(String(token || ""));
  if (tokenHash !== user.pendingEmailTokenHash) {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid verification token",
      data: null,
    };
  }

  // ✅ capture these BEFORE mutating user.email
  const oldEmail = user.email;
  const newEmail = user.pendingEmail;

  // final uniqueness check
  const existing = await User.findOne({
    _id: { $ne: user._id },
    email: newEmail,
  }).lean();

  if (existing) {
    return {
      success: false,
      statusCode: 409,
      message: "A user with that email already exists",
      data: null,
    };
  }

  // apply change
  user.email = newEmail;

  // clear pending fields
  user.pendingEmail = undefined;
  user.pendingEmailTokenHash = undefined;
  user.pendingEmailTokenExpiresAt = undefined;

  await user.save();

  // ✅ revoke ALL active sessions (force logout everywhere)
  await Session.updateMany(
    { user: user._id, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: "EMAIL_CHANGED" } },
  );

  // ✅ notify old email (recommended)

  const securityUrl = buildSecurityUrl();

  try {
    await sendEmail(
      oldEmail,
      "Your Litwebs email was changed",
      "emailChanged",
      {
        name: user.name,
        oldEmail,
        newEmail,
        when: new Date().toLocaleString("en-GB"),
        securityUrl,
      },
    );

    // optional: also notify the new email
    await sendEmail(
      newEmail,
      "Your Litwebs email was changed",
      "emailChanged",
      {
        name: user.name,
        oldEmail,
        newEmail,
        when: new Date().toLocaleString("en-GB"),
        securityUrl,
      },
    );
  } catch (_) {
    // don't fail the verification if email sending fails
  }

  return {
    success: true,
    message: "Email changed successfully",
    data: sanitizeUser(user),
  };
};

module.exports = { UpdateSelf, confirmEmailChange };
