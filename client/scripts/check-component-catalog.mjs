import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const currentFile = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(currentFile);
const clientDir = path.resolve(scriptsDir, "..");

const barrelPath = path.join(clientDir, "src/components/common/index.ts");
const storiesPath = path.join(
  clientDir,
  "src/pages/ComponentCatalog/CatalogStories.ts",
);

const barrel = fs.readFileSync(barrelPath, "utf8");
const stories = fs.readFileSync(storiesPath, "utf8");

const exportedModules = new Set(
  Array.from(barrel.matchAll(/from\s+["']\.\/(.+?)["']/g), (match) => match[1]),
);

const registeredModules = Array.from(
  stories.matchAll(/moduleName:\s*["'](.+?)["']/g),
  (match) => match[1],
);

const registeredSet = new Set(registeredModules);
const duplicateModules = registeredModules.filter(
  (moduleName, index) => registeredModules.indexOf(moduleName) !== index,
);

const missing = [...exportedModules].filter(
  (moduleName) => !registeredSet.has(moduleName),
);

const unknown = [...registeredSet].filter(
  (moduleName) => !exportedModules.has(moduleName),
);

if (duplicateModules.length > 0) {
  console.error(
    `Component catalog has duplicate module registrations: ${[...new Set(duplicateModules)].join(", ")}`,
  );
  process.exitCode = 1;
}

if (missing.length > 0) {
  console.error(
    `Component catalog is missing shared modules: ${missing.join(", ")}`,
  );
  process.exitCode = 1;
}

if (unknown.length > 0) {
  console.error(
    `Component catalog references modules not exported by common/index.ts: ${unknown.join(", ")}`,
  );
  process.exitCode = 1;
}

if (!process.exitCode) {
  console.log(
    `Component catalog coverage OK: ${registeredSet.size}/${exportedModules.size} shared modules registered.`,
  );
}
