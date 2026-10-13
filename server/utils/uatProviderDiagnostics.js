"use strict";

const STATUSES = new Set([
  "INVALID_ARGUMENT", "PERMISSION_DENIED", "RESOURCE_EXHAUSTED", "UNAUTHENTICATED",
  "UNAVAILABLE", "NOT_FOUND", "INTERNAL", "DEADLINE_EXCEEDED", "FAILED_PRECONDITION",
]);
const NETWORK_CODES = new Set([
  "EAI_AGAIN", "ENOTFOUND", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH",
  "ENETUNREACH", "ECONNREFUSED", "EACCES", "EPERM",
]);
const REASONS = new Set([
  "SERVICE_DISABLED", "BILLING_DISABLED", "QUOTA_EXCEEDED", "RATE_LIMIT_EXCEEDED",
  "ACCESS_TOKEN_SCOPE_INSUFFICIENT", "IAM_PERMISSION_DENIED", "CONSUMER_INVALID",
  "USER_PROJECT_DENIED", "CREDENTIALS_MISSING", "API_KEY_INVALID", "PROJECT_INVALID",
]);
const OAUTH_ERRORS = new Set(["invalid_grant", "invalid_client", "unauthorized_client", "invalid_scope"]);
const ENDPOINTS = [
  ["geocoding", "maps.googleapis.com"],
  ["oauth", "oauth2.googleapis.com"],
  ["route-optimization", "routeoptimization.googleapis.com"],
];

function safeGoogleError(error) {
  const result = {};
  if (error?.code === "ERR_ASSERTION") result.category = "unexpected-route-result";
  const code = [error?.code, error?.cause?.code].find(value => NETWORK_CODES.has(value));
  if (code) result.networkCode = code;
  const status = error?.response?.status;
  if (Number.isInteger(status) && status >= 100 && status <= 599) result.httpStatus = status;
  const provider = error?.response?.data?.error;
  if (STATUSES.has(provider?.status)) result.providerStatus = provider.status;
  if (OAUTH_ERRORS.has(provider)) result.oauthError = provider;
  const details = Array.isArray(provider?.details) ? provider.details : [];
  const reason = details.map(detail => detail?.reason).find(value => REASONS.has(value));
  if (reason) result.reason = reason;
  // Examine the URL only to classify a known endpoint. Never return any URL,
  // message, stack, request configuration, response body, token or credential.
  try {
    const hostname = new URL(error?.config?.url || error?.response?.config?.url).hostname;
    const endpoint = ENDPOINTS.find(([, host]) => host === hostname);
    if (endpoint) result.endpoint = endpoint[0];
  } catch { /* Unknown URLs are deliberately omitted. */ }
  return Object.keys(result).length ? result : { category: "unclassified-provider-error" };
}

async function googleNetworkCoverage(options = {}) {
  const fs = require("node:fs");
  const dns = require("node:dns").promises;
  const { isIP } = require("node:net");
  const readPolicy = options.readPolicy || (() => fs.readFileSync(
    "/etc/systemd/system/levants-uat-api.service.d/google.conf", "utf8",
  ));
  const lookup = options.lookup || (host => dns.lookup(host, { all: true }));
  let allowed;
  try {
    const source = await readPolicy();
    allowed = new Set(source.split("\n").filter(line => line.startsWith("IPAddressAllow="))
      .flatMap(line => line.slice("IPAddressAllow=".length).trim().split(/\s+/))
      .filter(address => isIP(address)));
  } catch { return { policyInspection: "unavailable" }; }
  const endpoints = [];
  for (const [endpoint, host] of ENDPOINTS) {
    try {
      const addresses = [...new Set((await lookup(host)).map(row => row.address).filter(address => isIP(address)))];
      const covered = addresses.filter(address => allowed.has(address)).length;
      endpoints.push({ endpoint, dnsResolved: addresses.length > 0,
        resolvedAddressCount: addresses.length, coveredAddressCount: covered,
        allResolvedAddressesAllowed: addresses.length > 0 && covered === addresses.length });
    } catch { endpoints.push({ endpoint, dnsResolved: false }); }
  }
  return { policyInspection: "available", endpoints };
}

module.exports = { safeGoogleError, googleNetworkCoverage };
