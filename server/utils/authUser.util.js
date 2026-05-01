"use strict";

const { normalizeDriverRouting } = require("./driverRouting.util");

const DRIVER_NOTIFICATION_DEFAULTS = Object.freeze({
  newOrders: false,
  orderUpdates: false,
  lowStockAlerts: false,
  outOfStock: false,
  deliveryUpdates: false,
  customerMessages: false,
  paymentReceived: false,
});

function isDriverRole(role) {
  return String(role?.name || "") === "driver";
}

function getDriverNotificationDefaults() {
  return { ...DRIVER_NOTIFICATION_DEFAULTS };
}

function mergeDriverRouting(existingValue, nextValue) {
  const existing = normalizeDriverRouting(existingValue || {});
  const hasNext = nextValue && typeof nextValue === "object";

  if (!hasNext) {
    return existing;
  }

  const merged = {
    postcodeAreas:
      nextValue.postcodeAreas !== undefined
        ? nextValue.postcodeAreas
        : existing.postcodeAreas,
    routeStartTime:
      nextValue.routeStartTime !== undefined
        ? nextValue.routeStartTime
        : existing.routeStartTime,
  };

  return normalizeDriverRouting(merged);
}

function sanitizeUser(user) {
  if (!user) return null;

  const obj = user.toJSON ? user.toJSON() : { ...user };

  delete obj.passwordHash;
  delete obj.twoFactorSecret;
  delete obj.pendingEmailTokenHash;
  delete obj.twoFactorLogin;
  delete obj.__v;

  if (obj.pendingEmail) {
    obj.emailChange = {
      pending: true,
      pendingEmail: obj.pendingEmail,
      expiresAt: obj.pendingEmailTokenExpiresAt || null,
    };
  }
  delete obj.pendingEmailTokenExpiresAt;

  // Never expose invitation hashes in responses
  delete obj.inviteTokenHash;

  return obj;
}

module.exports = {
  DRIVER_NOTIFICATION_DEFAULTS,
  isDriverRole,
  getDriverNotificationDefaults,
  mergeDriverRouting,
  sanitizeUser,
};
