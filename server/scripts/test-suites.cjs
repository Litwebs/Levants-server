"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const suites = require("./test-suites.json");
const serverRoot = path.resolve(__dirname, "..");

function partition(files, definitions, browser = false) {
  const result = Object.fromEntries(definitions.map(s => [s.id, []]));
  for (const file of files) {
    const matches = definitions.filter(s => browser
      ? s.files.includes(file)
      : s.paths.some(p => p.endsWith("/") ? file.startsWith(p) : file === p));
    if (matches.length !== 1) throw new Error(`${file}: expected one suite, found ${matches.length}`);
    result[matches[0].id].push(file);
  }
  for (const s of definitions) {
    if (!result[s.id].length) throw new Error(`Suite ${s.id} is empty`);
    if (browser && s.files.some(file => !files.includes(file))) throw new Error(`Suite ${s.id} references a missing spec`);
  }
  return result;
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}

function verify() {
  // Ask Jest for its actual inventory, so new tests cannot silently be omitted.
  const listed = spawnSync(process.execPath, ["node_modules/jest/bin/jest.js", "--listTests", "--json", "--runInBand", "--no-watchman"], { cwd: serverRoot, encoding: "utf8" });
  if (listed.status !== 0) throw new Error(`Jest inventory failed: ${listed.stderr}`);
  const backend = JSON.parse(listed.stdout).map(file => path.relative(path.join(serverRoot, "Tests"), file).split(path.sep).join("/"));
  const browser = walk(path.join(serverRoot, "e2e/portal-subscriptions")).filter(file => file.endsWith(".spec.js")).map(file => path.basename(file));
  return { backend: partition(backend, suites.backend), browser: partition(browser, suites.browser, true) };
}

function markdown(value) { return String(value).replace(/\|/g, "\\|").replace(/[\r\n]+/g, " "); }
function summarize(reportPath, title) {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const lines = [`## ${title}`, "", "| Test file | Passed | Failed | Skipped |", "|---|---:|---:|---:|"];
  if (Array.isArray(report.testResults)) {
    for (const file of report.testResults) {
      const assertions = file.assertionResults || [];
      lines.push(`| ${markdown(path.relative(serverRoot, file.name))} | ${assertions.filter(t => t.status === "passed").length} | ${assertions.filter(t => t.status === "failed").length} | ${assertions.filter(t => ["pending", "todo", "skipped"].includes(t.status)).length} |`);
      for (const test of assertions.filter(t => t.status === "failed")) lines.push(`\nFailed: ${markdown(test.fullName)}\n`);
    }
    lines.push(`\n**Total:** ${report.numPassedTests} passed, ${report.numFailedTests} failed, ${report.numPendingTests} pending/skipped.`);
  } else {
    function specs(suite) { return [...(suite.specs || []), ...(suite.suites || []).flatMap(specs)]; }
    for (const suite of report.suites || []) {
      const tests = specs(suite).flatMap(s => s.tests || []);
      lines.push(`| ${markdown(suite.file || suite.title)} | ${tests.filter(t => t.status === "expected").length} | ${tests.filter(t => ["unexpected", "flaky"].includes(t.status)).length} | ${tests.filter(t => t.status === "skipped").length} |`);
    }
    const stats = report.stats || {};
    lines.push(`\n**Total:** ${stats.expected || 0} passed, ${stats.unexpected || 0} failed, ${stats.flaky || 0} flaky, ${stats.skipped || 0} skipped.`);
  }
  const text = lines.join("\n") + "\n";
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  else process.stdout.write(text);
}

function main(args) {
  const [command, id] = args;
  if (command === "matrix") {
    console.log(JSON.stringify({ include: suites.backend.map(({ id, name }) => ({ id, name })) }));
    return;
  }
  if (command === "verify") {
    const inventory = verify();
    for (const kind of ["backend", "browser"]) for (const s of suites[kind]) console.log(`${kind}: ${s.name} — ${inventory[kind][s.id].length} files`);
    return;
  }
  if (command === "summary") return summarize(id, args[2] || "Test results");
  if (!["backend", "browser"].includes(command)) throw new Error("Use matrix, verify, backend <suite>, browser <suite>, or summary <report> <title>");
  const definition = suites[command].find(s => s.id === id);
  if (!definition) throw new Error(`Unknown ${command} suite: ${id}`);
  const reportDirectory = path.join(serverRoot, "test-results/suites");
  fs.mkdirSync(reportDirectory, { recursive: true });
  const report = path.join(reportDirectory, `${command}-${id}.json`);
  let invocation;
  if (command === "backend") {
    const files = verify().backend[id].map(file => `Tests/${file}`);
    invocation = ["node_modules/jest/bin/jest.js", "--runInBand", "--no-watchman", "--verbose", "--json", `--outputFile=${report}`, "--runTestsByPath", ...files];
  } else {
    partition(walk(path.join(serverRoot, "e2e/portal-subscriptions")).filter(file => file.endsWith(".spec.js")).map(file => path.basename(file)), suites.browser, true);
    invocation = ["node_modules/@playwright/test/cli.js", "test", ...definition.files, "--reporter=line,json,html", `--output=test-results/playwright/${id}`];
  }
  const result = spawnSync(process.execPath, invocation, {
    cwd: serverRoot, stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: process.env.NODE_OPTIONS || "--max-old-space-size=4096", PLAYWRIGHT_JSON_OUTPUT_NAME: report, PLAYWRIGHT_HTML_OUTPUT_DIR: path.join(serverRoot, "playwright-report", id) },
  });
  if (fs.existsSync(report)) summarize(report, `${definition.name} (${command === "backend" ? "Jest" : "Playwright"})`);
  else console.error(`No report produced for ${definition.name}; runner may have failed before tests started.`);
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status === 0 ? 0 : 1;
}

module.exports = { partition, summarize };
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
