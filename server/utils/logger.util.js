"use strict";

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

const C = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

const c = (color, str) => `${C[color]}${str}${RESET}`;
const bold = (str) => `${BOLD}${str}${RESET}`;
const dim = (str) => `${DIM}${str}${RESET}`;

const logger = {
  info(msg) {
    console.log(`  ${c("cyan", "ℹ")}  ${msg}`);
  },

  success(msg) {
    console.log(`  ${c("green", "✓")}  ${bold(msg)}`);
  },

  warn(msg, meta) {
    console.warn(
      `  ${c("yellow", "⚠")}  ${msg}${meta ? `  ${dim(JSON.stringify(meta))}` : ""}`,
    );
  },

  error(msg, err) {
    const detail =
      err instanceof Error ? err.message : typeof err === "string" ? err : null;
    console.error(
      `  ${c("red", "✗")}  ${bold(msg)}${detail ? `\n     ${c("gray", detail)}` : ""}`,
    );
  },

  server(port, env) {
    const line = "─".repeat(36);
    console.log(`\n  ${c("gray", line)}`);
    console.log(
      `  ${c("magenta", "🚀")}  ${bold("Levants API")}  ${c("gray", "·")}  ${c("cyan", `port ${port}`)}  ${c("gray", "·")}  ${c("yellow", env)}`,
    );
    console.log(`  ${c("gray", line)}\n`);
  },

  db(msg) {
    console.log(`  ${c("green", "◆")}  ${msg}`);
  },

  cron(name) {
    console.log(`  ${c("blue", "⏱")}  ${name} ${c("gray", "registered")}`);
  },

  shutdown(msg) {
    console.log(`\n  ${c("yellow", "→")}  ${msg}`);
  },
};

module.exports = logger;
