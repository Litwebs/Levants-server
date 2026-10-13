import {
  getComponentSources,
  getExportedCommonModules,
} from "./catalogSource";

const clientSourceFiles = import.meta.glob("../../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const commonModuleIndexSources = import.meta.glob(
  "../../components/common/*/index.ts",
  {
    query: "?raw",
    import: "default",
    eager: true,
  },
) as Record<string, string>;

export type ComponentUsageSymbol = {
  exportedName: string;
  localName: string;
  references: number;
};

export type ComponentUsage = {
  file: string;
  sourcePath: string;
  importLine: number;
  importStyles: Array<"barrel" | "direct">;
  symbols: ComponentUsageSymbol[];
  references: number;
  area: string;
  feature: string;
  kind: "application" | "shared";
};

export type ComponentUsageSummary = {
  moduleName: string;
  exportedSymbols: string[];
  usages: ComponentUsage[];
  applicationFiles: number;
  sharedFiles: number;
  references: number;
  areas: number;
};

function normalizeRelativePath(pathname: string) {
  const parts = pathname.split("/");
  const normalized: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      normalized.pop();
      continue;
    }
    normalized.push(part);
  }

  return normalized.join("/");
}

function sourceRelativePath(key: string) {
  return key.replace(/^\.\.\/\.\.\//, "");
}

function stripSourceExtension(pathname: string) {
  return pathname.replace(/\.(?:tsx?|jsx?)$/, "");
}

function resolveSourceImport(sourceFile: string, specifier: string) {
  if (specifier.startsWith("@/")) {
    return stripSourceExtension(specifier.slice(2));
  }

  if (!specifier.startsWith(".")) return null;

  const directory = sourceFile.includes("/")
    ? sourceFile.slice(0, sourceFile.lastIndexOf("/"))
    : "";

  return stripSourceExtension(
    normalizeRelativePath(directory + "/" + specifier),
  );
}

function getModuleIndexSource(moduleName: string) {
  const key = Object.keys(commonModuleIndexSources).find((candidate) =>
    candidate.endsWith("/common/" + moduleName + "/index.ts"),
  );

  return key ? commonModuleIndexSources[key] : "";
}

function extractRuntimeExportNames(source: string) {
  const names = new Set<string>();

  const namedExportPattern =
    /export\s+(?!type\b)\{([\s\S]*?)\}\s*from\s*["'][^"']+["']/g;
  let match: RegExpExecArray | null;

  while ((match = namedExportPattern.exec(source)) !== null) {
    for (const rawEntry of match[1].split(",")) {
      const entry = rawEntry.trim();
      if (!entry || entry.startsWith("type ")) continue;

      const parts = entry.split(/\s+as\s+/);
      const exportedName = (parts[1] ?? parts[0]).trim();
      if (exportedName && exportedName !== "default") names.add(exportedName);
    }
  }

  const declarationPattern =
    /export\s+(?:const|function|class)\s+([A-Za-z_$][\w$]*)/g;

  while ((match = declarationPattern.exec(source)) !== null) {
    names.add(match[1]);
  }

  return Array.from(names);
}

export function getModuleRuntimeExports(moduleName: string) {
  const fromIndex = extractRuntimeExportNames(getModuleIndexSource(moduleName));
  const fromSource = extractRuntimeExportNames(getComponentSources(moduleName).tsx);

  return Array.from(new Set([...fromIndex, ...fromSource])).sort((a, b) =>
    a.localeCompare(b),
  );
}

function parseNamedImports(clause: string) {
  const block = clause.match(/\{([\s\S]*?)\}/);
  if (!block) return [] as Array<{ importedName: string; localName: string }>;

  return block[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => entry.replace(/^type\s+/, "").trim())
    .filter(Boolean)
    .map((entry) => {
      const [importedName, localName] = entry.split(/\s+as\s+/).map((value) =>
        value.trim(),
      );

      return {
        importedName,
        localName: localName || importedName,
      };
    });
}

function countIdentifierReferences(source: string, identifier: string) {
  if (!identifier) return 0;
  const escaped = identifier.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
  return (source.match(new RegExp("\\b" + escaped + "\\b", "g")) ?? []).length;
}

function classifyUsage(sourcePath: string) {
  if (sourcePath.startsWith("components/common/")) {
    const module = sourcePath.split("/")[2] || "Common";
    return {
      area: "Shared components",
      feature: module,
      kind: "shared" as const,
    };
  }

  const parts = sourcePath.split("/");
  const root = parts[0];

  if (root === "pages") {
    return {
      area: "Pages",
      feature:
        parts.length > 2
          ? parts[1]
          : (parts[1] || "Pages").replace(/\.(?:tsx?|jsx?)$/, ""),
      kind: "application" as const,
    };
  }

  if (root === "components") {
    return {
      area: "Components",
      feature: parts[1] || "Components",
      kind: "application" as const,
    };
  }

  if (root === "context") {
    return {
      area: "Context",
      feature: parts[1] || "Context",
      kind: "application" as const,
    };
  }

  if (root === "hooks") {
    return {
      area: "Hooks",
      feature: "Hooks",
      kind: "application" as const,
    };
  }

  if (root === "App.tsx" || root === "main.tsx") {
    return {
      area: "Application",
      feature: "Shell",
      kind: "application" as const,
    };
  }

  return {
    area: "Other",
    feature: root.replace(/\.(?:tsx?|jsx?)$/, "") || "Other",
    kind: "application" as const,
  };
}

function matchesModuleTarget(resolved: string, moduleName: string) {
  const base = "components/common/" + moduleName;

  return (
    resolved === base ||
    resolved === base + "/index" ||
    resolved === base + "/" + moduleName ||
    resolved.startsWith(base + "/")
  );
}

export function getComponentUsage(moduleName: string): ComponentUsageSummary {
  const exportedSymbols = getModuleRuntimeExports(moduleName);
  const exportedSet = new Set(exportedSymbols);
  const byFile = new Map<string, ComponentUsage>();

  const symbolToModule = new Map<string, string>();
  for (const exportedModule of getExportedCommonModules()) {
    for (const symbol of getModuleRuntimeExports(exportedModule)) {
      if (!symbolToModule.has(symbol)) symbolToModule.set(symbol, exportedModule);
    }
  }

  const importPattern =
    /import\s+(?!type\b)([\s\S]*?)\s+from\s+["']([^"']+)["'];?/g;

  for (const [key, source] of Object.entries(clientSourceFiles)) {
    const sourcePath = sourceRelativePath(key);

    if (sourcePath.startsWith("pages/ComponentCatalog/")) continue;

    if (
      sourcePath === "components/common/" + moduleName + "/" + moduleName + ".tsx" ||
      sourcePath === "components/common/" + moduleName + "/index.ts"
    ) {
      continue;
    }

    const imports = Array.from(source.matchAll(importPattern));
    if (imports.length === 0) continue;

    const sourceWithoutImports = source.replace(importPattern, "");
    const matchedImports: Array<{
      line: number;
      style: "barrel" | "direct";
      symbols: ComponentUsageSymbol[];
    }> = [];

    for (const importMatch of imports) {
      const clause = importMatch[1];
      const specifier = importMatch[2];
      const resolved = resolveSourceImport(sourcePath, specifier);
      if (!resolved) continue;

      const namedImports = parseNamedImports(clause);
      if (namedImports.length === 0) continue;

      const isBarrel =
        resolved === "components/common" ||
        resolved === "components/common/index";
      const isDirect = matchesModuleTarget(resolved, moduleName);

      if (!isBarrel && !isDirect) continue;

      const symbols = namedImports
        .filter(({ importedName }) => {
          if (isDirect) return exportedSet.has(importedName);
          return symbolToModule.get(importedName) === moduleName;
        })
        .map(({ importedName, localName }) => ({
          exportedName: importedName,
          localName,
          references: countIdentifierReferences(sourceWithoutImports, localName),
        }));

      if (symbols.length === 0) continue;

      const index = importMatch.index ?? 0;
      matchedImports.push({
        line: source.slice(0, index).split("\n").length,
        style: isBarrel ? "barrel" : "direct",
        symbols,
      });
    }

    if (matchedImports.length === 0) continue;

    const classification = classifyUsage(sourcePath);
    const existing = byFile.get(sourcePath);

    if (!existing) {
      const symbols = matchedImports.flatMap((item) => item.symbols);

      byFile.set(sourcePath, {
        file: sourcePath.split("/").pop() || sourcePath,
        sourcePath,
        importLine: Math.min(...matchedImports.map((item) => item.line)),
        importStyles: Array.from(
          new Set(matchedImports.map((item) => item.style)),
        ),
        symbols,
        references: symbols.reduce(
          (total, symbol) => total + symbol.references,
          0,
        ),
        ...classification,
      });
      continue;
    }

    existing.importLine = Math.min(
      existing.importLine,
      ...matchedImports.map((item) => item.line),
    );
    existing.importStyles = Array.from(
      new Set([
        ...existing.importStyles,
        ...matchedImports.map((item) => item.style),
      ]),
    );

    for (const symbol of matchedImports.flatMap((item) => item.symbols)) {
      const prior = existing.symbols.find(
        (candidate) =>
          candidate.exportedName === symbol.exportedName &&
          candidate.localName === symbol.localName,
      );

      if (prior) prior.references += symbol.references;
      else existing.symbols.push(symbol);
    }

    existing.references = existing.symbols.reduce(
      (total, symbol) => total + symbol.references,
      0,
    );
  }

  const usages = Array.from(byFile.values()).sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "application" ? -1 : 1;
    if (a.area !== b.area) return a.area.localeCompare(b.area);
    if (a.feature !== b.feature) return a.feature.localeCompare(b.feature);
    return a.sourcePath.localeCompare(b.sourcePath);
  });

  return {
    moduleName,
    exportedSymbols,
    usages,
    applicationFiles: usages.filter((usage) => usage.kind === "application").length,
    sharedFiles: usages.filter((usage) => usage.kind === "shared").length,
    references: usages.reduce((total, usage) => total + usage.references, 0),
    areas: new Set(usages.map((usage) => usage.area)).size,
  };
}
