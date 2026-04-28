"use strict";

const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("../models/user.model");
const Role = require("../models/role.model");
const PasswordResetToken = require("../models/passwordResetToken.model");
const passwordUtil = require("../utils/password.util");
const Session = require("../models/session.model");
const cryptoUtil = require("../utils/crypto.util");
const sendEmail = require("../Integration/Email.service");
const { Response } = require("../utils/response.util");
const {
  isDriverRole,
  getDriverNotificationDefaults,
  mergeDriverRouting,
  sanitizeUser,
} = require("../utils/authUser.util");
const {
  buildVerifyEmailLink,
  buildAcceptInvitationLink,
} = require("../utils/authLinks.util");

const UpdateUserStatus = async ({ targetUserId, status, actorUserId }) => {
  if (String(targetUserId) === String(actorUserId)) {
    return {
      success: false,
      statusCode: 400,
      message: "You cannot change your own account status",
    };
  }

  const user = await User.findById(targetUserId);

  if (!user) {
    return {
      success: false,
      statusCode: 404,
      message: "User not found",
    };
  }

  if (user.status === status) {
    return {
      success: true,
      data: { user: sanitizeUser(user) },
    };
  }

  user.status = status;
  await user.save();

  return {
    success: true,
    data: { user: sanitizeUser(user) },
  };
};

const GetUserById = async ({ targetUserId, requesterUserId }) => {
  // Optional rule: prevent self-lookup via admin route
  // (encourage using /me instead)
  if (String(targetUserId) === String(requesterUserId)) {
    return {
      success: false,
      statusCode: 400,
      message: "Use /me endpoint to view your own profile",
    };
  }

  const user = await User.findById(targetUserId)
    .populate("role", "name permissions")
    .select("-passwordHash -twoFactorSecret -twoFactorLogin");

  if (!user) {
    return {
      success: false,
      statusCode: 404,
      message: "User not found",
    };
  }

  return {
    success: true,
    data: { user: sanitizeUser(user) },
  };
};

const ListUsers = async ({ page = 1, pageSize = 20, status, role, search }) => {
  const query = {};

  // Optional filters
  if (status) {
    query.status = status;
  }

  if (role) {
    query.role = role; // expects role ObjectId
  }

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (page - 1) * pageSize;

  const [items, total] = await Promise.all([
    User.find(query)
      .populate("role", "name")
      .select("-passwordHash -twoFactorSecret -twoFactorLogin")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize),
    User.countDocuments(query),
  ]);

  return {
    success: true,
    data: {
      users: items,
    },
    meta: {
      page,
      pageSize,
      total,
    },
  };
};

const UpdateUser = async ({ targetUserId, updates, actorUserId }) => {
  // ❌ Prevent admin editing themselves via admin route
  if (String(targetUserId) === String(actorUserId)) {
    return {
      success: false,
      statusCode: 400,
      message: "Use profile settings to update your own account",
    };
  }

  const user = await User.findById(targetUserId);
  if (!user) {
    return {
      success: false,
      statusCode: 404,
      message: "User not found",
    };
  }

  const { name, email, roleId, status, password, preferences, driverRouting } =
    updates;

  if (name !== undefined) user.name = name;

  // Email change (admin) must be verified by the new email address
  if (typeof email === "string") {
    const nextEmail = email.trim().toLowerCase();

    if (nextEmail && nextEmail !== user.email) {
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

      const verifyLink = buildVerifyEmailLink(user._id, rawToken);

      try {
        if (verifyLink) {
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
        } else {
          console.error(
            "[email-change] missing PUBLIC_APP_URL/CLIENT_FRONT_URL; cannot build verify link",
            { userId: user._id.toString(), email: nextEmail },
          );
        }
      } catch (_) {
        // Do not fail update if email sending fails.
      }
    }
  }

  if (status !== undefined) user.status = status;

  // Preferences (notifications only)
  if (preferences?.notifications) {
    const existingNotifications = user.preferences?.notifications?.toObject
      ? user.preferences.notifications.toObject()
      : user.preferences?.notifications || {};

    user.set("preferences.notifications", {
      ...existingNotifications,
      ...preferences.notifications,
    });
  }

  if (driverRouting && typeof driverRouting === "object") {
    user.driverRouting = mergeDriverRouting(user.driverRouting, driverRouting);
  }

  // Role change
  if (roleId) {
    const role = await Role.findById(roleId);
    if (!role) {
      return {
        success: false,
        statusCode: 400,
        message: "Invalid role",
      };
    }
    user.role = role._id;
    if (isDriverRole(role)) {
      user.set("preferences.notifications", getDriverNotificationDefaults());
      user.driverRouting = mergeDriverRouting(
        user.driverRouting,
        driverRouting,
      );
    }
  }

  // Password change
  if (password) {
    const newHash = await passwordUtil.hashPassword(password);
    user.passwordHash = newHash;
  }

  await user.save();

  const updatedUser = await User.findById(user._id)
    .populate("role", "name permissions")
    .select("-passwordHash -twoFactorSecret -twoFactorLogin");

  return {
    success: true,
    data: { user: sanitizeUser(updatedUser) },
  };
};

const AcceptInvitation = async ({ userId, token } = {}) => {
  if (!userId || !token) {
    return {
      success: false,
      statusCode: 400,
      message: "userId and token are required",
    };
  }

  const user = await User.findById(userId)
    .select("+inviteTokenHash")
    .populate("role", "name permissions")
    .select("-passwordHash -twoFactorSecret -twoFactorLogin");

  if (!user) {
    return {
      success: false,
      statusCode: 404,
      message: "User not found",
    };
  }

  if (!user.inviteTokenHash || !user.inviteTokenExpiresAt) {
    return {
      success: false,
      statusCode: 400,
      message: "Invitation is not pending",
    };
  }

  const now = new Date();
  if (user.inviteTokenExpiresAt <= now) {
    return {
      success: false,
      statusCode: 400,
      message: "Invitation has expired",
    };
  }

  const tokenHash = cryptoUtil.hashToken(String(token || ""));
  if (tokenHash !== user.inviteTokenHash) {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid invitation token",
    };
  }

  user.emailVerifiedAt = now;
  user.inviteTokenHash = undefined;
  user.inviteTokenExpiresAt = undefined;
  user.status = "active";

  await user.save();

  return {
    success: true,
    data: {
      user: sanitizeUser(user),
    },
  };
};

const DeleteUser = async ({ targetUserId, actorUserId } = {}) => {
  if (!mongoose.Types.ObjectId.isValid(String(targetUserId || ""))) {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid userId",
    };
  }

  if (String(targetUserId) === String(actorUserId)) {
    return {
      success: false,
      statusCode: 400,
      message: "You cannot delete your own account",
    };
  }

  const user = await User.findById(targetUserId);
  if (!user) {
    return {
      success: false,
      statusCode: 404,
      message: "User not found",
    };
  }

  await Promise.all([
    Session.deleteMany({ user: user._id }),
    PasswordResetToken.deleteMany({ user: user._id }),
  ]);

  await User.deleteOne({ _id: user._id });

  return {
    success: true,
    data: { deleted: true },
  };
};

// CREATE USER (Admin)
const CreateUser = async ({ body, actorUserId }) => {
  const { name, email, password, roleId, status, driverRouting } = body;

  const normalizedEmail = email.trim().toLowerCase();

  // Ensure role exists
  const role = await Role.findById(roleId);
  if (!role) {
    return {
      success: false,
      statusCode: 400,
      message: "Invalid role",
    };
  }

  // Ensure email uniqueness
  const existing = await User.findOne({ email: normalizedEmail }).lean();
  if (existing) {
    return {
      success: false,
      statusCode: 409,
      message: "A user with that email already exists",
    };
  }

  const passwordHash = await passwordUtil.hashPassword(password);

  const user = await User.create({
    name,
    email: normalizedEmail,
    passwordHash,
    role: role._id,
    driverRouting: mergeDriverRouting(undefined, driverRouting),
    ...(isDriverRole(role)
      ? {
          preferences: {
            notifications: getDriverNotificationDefaults(),
          },
        }
      : {}),
    // New users must accept the invitation to verify email.
    status: "disabled",
    createdBy: actorUserId,
    invitedAt: new Date(),
    invitedBy: actorUserId,
  });

  // Issue invitation token (expires in 1 hour)
  const rawToken = crypto.randomBytes(32).toString("hex");
  const inviteTokenHash = cryptoUtil.hashToken(rawToken);
  const inviteTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

  user.inviteTokenHash = inviteTokenHash;
  user.inviteTokenExpiresAt = inviteTokenExpiresAt;
  await user.save();

  // Send users to the frontend, which can call the API regardless of where it is hosted.
  const acceptLink = buildAcceptInvitationLink(user._id.toString(), rawToken);

  try {
    if (!acceptLink) {
      console.error(
        "[invite] missing FRONTEND_URL_PROD/FRONTEND_URL_DEV; cannot build invitation link",
        {
          userId: user._id.toString(),
          email: user.email,
        },
      );
    } else {
      await sendEmail(user.email, "Accept your invitation", "userInvitation", {
        name: user.name,
        invitedBy: "An admin",
        acceptLink,
        expiresInMinutes: 60,
      });
    }
  } catch (_) {
    // Do not fail user creation if email provider fails.
  }

  const populated = await User.findById(user._id)
    .populate("role", "name permissions")
    .select("-passwordHash -twoFactorSecret -twoFactorLogin");

  return {
    success: true,
    data: {
      user: sanitizeUser(populated),
    },
  };
};

module.exports = {
  UpdateUserStatus,
  GetUserById,
  ListUsers,
  UpdateUser,
  AcceptInvitation,
  DeleteUser,
  CreateUser,
};
