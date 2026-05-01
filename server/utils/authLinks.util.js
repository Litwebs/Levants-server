"use strict";

function getFrontendBaseUrl() {
  return process.env.NODE_ENV === "production"
    ? process.env.FRONTEND_URL_PROD
    : process.env.FRONTEND_URL_DEV;
}

function buildVerifyEmailLink(userId, token) {
  const base = getFrontendBaseUrl();
  if (!base) return "";
  return `${base.replace(/\/$/, "")}/verify-email-change?userId=${userId}&token=${token}`;
}

function buildAcceptInvitationLink(userId, token) {
  const base = getFrontendBaseUrl();
  if (!base) return "";
  return `${base.replace(/\/$/, "")}/accept-invitation?userId=${userId}&token=${token}`;
}

function buildSecurityUrl() {
  const base = getFrontendBaseUrl();
  if (!base) return "";
  return `${base.replace(/\/$/, "")}/settings`;
}

module.exports = {
  getFrontendBaseUrl,
  buildVerifyEmailLink,
  buildAcceptInvitationLink,
  buildSecurityUrl,
};
