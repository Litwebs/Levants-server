"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { safeGoogleError, googleNetworkCoverage } = require("../../server/utils/uatProviderDiagnostics.js");

test("classifies permission errors without exposing provider payloads", () => {
  const result = safeGoogleError({ response: { status: 403, data: { error: {
    status: "PERMISSION_DENIED", message: "PRIVATE_SECRET", details: [{ reason: "SERVICE_DISABLED", metadata: { key: "PRIVATE_SECRET" } }],
  } } }, config: { url: "https://routeoptimization.googleapis.com/v1/projects/PRIVATE_SECRET:optimizeTours", headers: { Authorization: "Bearer PRIVATE_SECRET" } } });
  assert.deepEqual(result, { httpStatus: 403, providerStatus: "PERMISSION_DENIED", reason: "SERVICE_DISABLED", endpoint: "route-optimization" });
  assert.ok(!JSON.stringify(result).includes("PRIVATE_SECRET"));
});
test("classifies OAuth grant failures without returning descriptions or tokens", () => {
  assert.deepEqual(safeGoogleError({ response: { status: 400, data: { error: "invalid_grant", error_description: "PRIVATE_SECRET" } },
    config: { url: "https://oauth2.googleapis.com/token?secret=PRIVATE_SECRET" } }),
  { httpStatus: 400, oauthError: "invalid_grant", endpoint: "oauth" });
});
test("identifies nested network policy failures", () => {
  assert.deepEqual(safeGoogleError({ cause: { code: "ENETUNREACH", message: "PRIVATE_SECRET" } }), { networkCode: "ENETUNREACH" });
});
test("unknown fields and arbitrary strings are never emitted", () => {
  assert.deepEqual(safeGoogleError({ code: "PRIVATE_SECRET", response: { status: "PRIVATE_SECRET", data: { error: {
    status: "PRIVATE_SECRET", details: [{ reason: "PRIVATE_SECRET" }],
  } } }, config: { url: "https://PRIVATE_SECRET.invalid/PRIVATE_SECRET" }, stack: "PRIVATE_SECRET" }),
  { category: "unclassified-provider-error" });
});
test("distinguishes an unexpected route result from a provider rejection", () => {
  assert.deepEqual(safeGoogleError({ code: "ERR_ASSERTION", message: "PRIVATE_SECRET" }), { category: "unexpected-route-result" });
});
test("reports DNS coverage counts without addresses or policy contents", async () => {
  const result = await googleNetworkCoverage({ readPolicy: () => "[Service]\nIPAddressAllow=8.8.8.8\n# PRIVATE_SECRET\n",
    lookup: async host => host === "maps.googleapis.com" ? [{ address: "8.8.8.8" }] : [{ address: "1.1.1.1" }, { address: "1.1.1.1" }] });
  assert.equal(result.endpoints[0].allResolvedAddressesAllowed, true);
  assert.equal(result.endpoints[1].allResolvedAddressesAllowed, false);
  assert.equal(result.endpoints[1].resolvedAddressCount, 1);
  assert.equal(result.endpoints[1].coveredAddressCount, 0);
  assert.ok(!/8\.8\.8\.8|1\.1\.1\.1|PRIVATE_SECRET/.test(JSON.stringify(result)));
});
test("policy access failure returns only a fixed diagnostic", async () => {
  assert.deepEqual(await googleNetworkCoverage({ readPolicy: () => { throw new Error("PRIVATE_SECRET"); } }), { policyInspection: "unavailable" });
});
test("DNS failure does not leak resolver messages or appear covered", async () => {
  const result = await googleNetworkCoverage({ readPolicy: () => "IPAddressAllow=8.8.8.8\n", lookup: async () => { throw new Error("PRIVATE_SECRET"); } });
  assert.ok(result.endpoints.every(row => row.dnsResolved === false));
  assert.ok(!JSON.stringify(result).includes("PRIVATE_SECRET"));
});
