"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { REQUIRED_EVENTS } = require("../../utils/subscriptionWebhookConfiguration.util");

const root = path.resolve(__dirname, "../../..");
const runbook = fs.readFileSync(path.join(root, "docs/PRODUCTION_RELEASE_RUNBOOK.md"), "utf8");
const audit = fs.readFileSync(path.join(root, "server/scripts/auditSubscriptionIntegrity.js"), "utf8");
// Inspect only the checked-in literal. Never execute the audit: it connects to
// Mongo and Stripe, which are deliberately unnecessary for documentation tests.
const literal = audit.match(/const requiredIndexes = (\[[\s\S]*?\n  \]);/)[1];
const indexes = JSON.parse(JSON.stringify(vm.runInNewContext(literal)));
const rows = runbook.split("\n").filter(line => /^\| `/.test(line)).map(line => {
  const cells = line.split("|").slice(1, -1).map(cell => cell.trim());
  const unquote = value => value.replace(/^`|`$/g, "");
  return { collection: unquote(cells[0]), keys: JSON.parse(unquote(cells[1])),
    partial: cells[2] === "None" ? null : JSON.parse(unquote(cells[2])) };
});

test("the documented required events exactly match the runtime contract", () => {
  const section = runbook.split("Required events (all ")[1].split("An enabled endpoint")[0];
  const events = [...section.matchAll(/^- `([^`]+)`$/gm)].map(match => match[1]);
  expect(events.sort()).toEqual([...REQUIRED_EVENTS].sort());
  expect(runbook).toContain(`Required events (all ${REQUIRED_EVENTS.length},`);
});

test("the runbook lists every audited index once, with no extra rows", () => {
  expect(runbook).toContain(`All ${["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"][indexes.length]} indexes below`);
  expect(rows.map(row => row.collection).sort()).toEqual(indexes.map(row => row[0]).sort());
  expect(new Set(rows.map(row => row.collection)).size).toBe(rows.length);
});

test.each(indexes.map(([collection, keys, partialField]) => [collection, keys, partialField || null]))("documents the exact audited keys and partial predicate for %s", (collection, keys, partialField) => {
  expect(rows.find(row => row.collection === collection)).toEqual({ collection, keys,
    partial: partialField ? { [partialField]: { $type: "string" } } : null });
});

test("documents every release prerequisite and the aggregate gate", () => {
  const workflow = fs.readFileSync(path.join(root, ".github/workflows/deploy.yml"), "utf8");
  for (const name of ["Backend tests", "Client lint and build", "Subscription E2E (Stripe test mode)", "Production release gate"]) {
    expect(workflow).toContain(`name: ${name}`);
    expect(runbook).toContain(`**${name}**`);
  }
  expect(runbook).toContain("this\nserver workflow does not deploy the customer portal");
  expect(runbook).toContain("a separate build of that same commit, not the PR build");
});

test("keeps audit scope and operator approval explicit", () => {
  expect(runbook).toContain("default command is read-only");
  expect(runbook).toContain("before approving this Stripe write");
  expect(runbook).toContain("`AUDIT_RESULT`");
  expect(runbook).toContain("are not included in the audit's issue count");
  expect(runbook).toContain("withhold production\nsign-off");
  expect(runbook).not.toContain("both unique-index checks");
});
