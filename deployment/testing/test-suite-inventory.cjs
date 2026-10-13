"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { partition, summarize } = require("../../server/scripts/test-suites.cjs");

test("new folders cannot disappear from CI", () => {
  assert.throws(() => partition(["Orders/a.test.js", "NewFeature/b.test.js"], [{ id: "orders", paths: ["Orders/"] }]), /NewFeature.*found 0/);
});
test("overlapping suite definitions are rejected", () => {
  assert.throws(() => partition(["Orders/a.test.js"], [{ id: "a", paths: ["Orders/"] }, { id: "b", paths: ["Orders/"] }]), /found 2/);
});
test("missing browser specs and empty suites are rejected", () => {
  assert.throws(() => partition(["a.spec.js"], [{ id: "browser", files: ["a.spec.js", "missing.spec.js"] }], true), /missing spec/);
  assert.throws(() => partition([], [{ id: "empty", paths: ["Orders/"] }]), /empty/);
});
test("failure results stay visible in the Actions summary", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "suite-report-"));
  const previous = process.env.GITHUB_STEP_SUMMARY;
  try {
    const report = path.join(directory, "report.json");
    const output = path.join(directory, "summary.md");
    process.env.GITHUB_STEP_SUMMARY = output;
    fs.writeFileSync(report, JSON.stringify({ numPassedTests: 1, numFailedTests: 1, numPendingTests: 0, testResults: [{ name: "Orders/refunds.test.js", assertionResults: [{ status: "passed", fullName: "refund succeeds" }, { status: "failed", fullName: "refund | replay" }] }] }));
    summarize(report, "Orders and refunds");
    const text = fs.readFileSync(output, "utf8");
    assert.match(text, /1 passed, 1 failed/);
    assert.ok(text.includes("refund \\| replay"));
  } finally {
    if (previous === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = previous;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
