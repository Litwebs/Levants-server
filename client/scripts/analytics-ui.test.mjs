import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

const here = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(here, "..");
const nodeRequire = createRequire(import.meta.url);
const moduleCache = new Map();

const resolveTypeScriptFile = (importer, specifier) => {
  const candidate = resolve(dirname(importer), specifier);
  if (extname(candidate)) return candidate;

  for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const resolved = candidate + suffix;
    try {
      readFileSync(resolved, "utf8");
      return resolved;
    } catch {
      // Try the next supported TypeScript module form.
    }
  }

  throw new Error(`Unable to resolve TypeScript module ${specifier} from ${importer}`);
};

const loadTypeScriptModule = (relativePathOrAbsolute) => {
  const filename = relativePathOrAbsolute.startsWith("/")
    ? relativePathOrAbsolute
    : resolve(clientRoot, relativePathOrAbsolute);

  if (moduleCache.has(filename)) return moduleCache.get(filename).exports;

  const source = readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
    reportDiagnostics: true,
  });

  const errors = (output.diagnostics || []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.equal(errors.length, 0, `TypeScript transpile errors in ${filename}`);

  const module = { exports: {} };
  moduleCache.set(filename, module);

  const localRequire = (specifier) => {
    if (specifier.startsWith(".")) {
      return loadTypeScriptModule(resolveTypeScriptFile(filename, specifier));
    }
    return nodeRequire(specifier);
  };

  const execute = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    output.outputText,
  );
  execute(module.exports, localRequire, module, filename, dirname(filename));
  return module.exports;
};

const filters = loadTypeScriptModule("src/context/Analytics/filters.ts");
const constants = loadTypeScriptModule("src/context/Analytics/constants.ts");
const reducerModule = loadTypeScriptModule(
  "src/context/Analytics/AnalyticsReducer.ts",
);
const csv = loadTypeScriptModule("src/lib/csvExport.ts");

test("analytics filter options expose every production source and comparison mode", () => {
  assert.deepEqual(
    filters.analyticsOrderSourceOptions.map((option) => option.value),
    ["all", "website", "subscription", "imported"],
  );
  assert.deepEqual(
    filters.analyticsComparisonOptions.map((option) => option.value),
    ["previous_period", "previous_year", "none"],
  );
});

test("analytics range defaults never select an unsafe fine-grained all-time interval", () => {
  assert.equal(filters.defaultAnalyticsIntervalForRange("today"), "day");
  assert.equal(filters.defaultAnalyticsIntervalForRange("last7"), "day");
  assert.equal(filters.defaultAnalyticsIntervalForRange("last30"), "week");
  assert.equal(filters.defaultAnalyticsIntervalForRange("thisYear"), "month");
  assert.equal(filters.defaultAnalyticsIntervalForRange("all"), "month");
  assert.equal(filters.defaultAnalyticsIntervalForRange("custom"), "day");
});

test("filter merging preserves custom dates and comparison when another filter changes", () => {
  const current = {
    range: "custom",
    orderSource: "all",
    from: "2026-06-10",
    to: "2026-06-12",
    interval: "day",
    comparison: "previous_year",
  };

  assert.deepEqual(
    filters.mergeAnalyticsFilters(current, {
      range: "custom",
      orderSource: "subscription",
    }),
    {
      ...current,
      orderSource: "subscription",
    },
  );

  assert.deepEqual(
    filters.mergeAnalyticsFilters(current, {
      range: "custom",
      from: "",
      to: "",
    }),
    {
      ...current,
      from: "",
      to: "",
    },
  );
});

test("dashboard request/failure reducer states preserve the last successful dashboard", () => {
  const dashboard = { summary: { totalOrders: 3 } };
  const state = {
    ...constants.initialAnalyticsState,
    dashboard,
    error: "old error",
  };

  const requested = reducerModule.default(state, {
    type: reducerModule.ANALYTICS_REQUEST,
  });
  assert.equal(requested.loading, true);
  assert.equal(requested.error, null);
  assert.equal(requested.dashboard, dashboard);

  const failed = reducerModule.default(requested, {
    type: reducerModule.ANALYTICS_FAILURE,
    payload: "refresh failed",
  });
  assert.equal(failed.loading, false);
  assert.equal(failed.error, "refresh failed");
  assert.equal(failed.dashboard, dashboard);
});

test("CSV export keeps numeric values numeric and neutralizes spreadsheet formulas", () => {
  const output = csv.buildCsv(
    [
      { label: "Normal", amount: 12.5 },
      { label: "=2+2", amount: -7 },
      { label: "  @SUM(A1:A2)", amount: 0 },
      { label: 'Quoted, "value"\nnext', amount: null },
    ],
    [
      { header: "Label", value: (row) => row.label },
      { header: "Amount", value: (row) => row.amount },
    ],
  );

  assert.ok(output.startsWith("Label,Amount\r\n"));
  assert.ok(output.includes("'=2+2,-7"));
  assert.ok(output.includes("'  @SUM(A1:A2),0"));
  assert.ok(output.includes('"Quoted, ""value""\nnext",'));
});
