import commonIndexSource from "../../components/common/index.ts?raw";
import variablesSource from "../../styles/variables.css?raw";

const tsxSources = import.meta.glob("../../components/common/**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const cssSources = import.meta.glob("../../components/common/**/*.module.css", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export type ApiProp = {
  name: string;
  optional: boolean;
  type: string;
};

export type ApiDeclaration = {
  name: string;
  kind: "interface" | "inline-props" | "type";
  extendsType?: string;
  props?: ApiProp[];
  definition?: string;
};

export function getExportedCommonModules(): string[] {
  const modules = new Set<string>();
  const pattern = /from\s+["']\.\/(.+?)["']/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(commonIndexSource)) !== null) {
    modules.add(match[1]);
  }

  return Array.from(modules).sort((a, b) => a.localeCompare(b));
}

export function getComponentSources(moduleName: string) {
  const tsxKey = Object.keys(tsxSources).find((key) =>
    key.endsWith(`/common/${moduleName}/${moduleName}.tsx`),
  );
  const cssKey = Object.keys(cssSources).find((key) =>
    key.endsWith(`/common/${moduleName}/${moduleName}.module.css`),
  ) ?? Object.keys(cssSources).find((key) =>
    key.includes(`/common/${moduleName}/`),
  );

  return {
    tsx: tsxKey ? tsxSources[tsxKey] : "",
    css: cssKey ? cssSources[cssKey] : "",
  };
}

export function getVariablesSource() {
  return variablesSource;
}

function findBalancedBlock(source: string, openingBraceIndex: number) {
  let depth = 0;

  for (let index = openingBraceIndex; index < source.length; index += 1) {
    const char = source[index];

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          body: source.slice(openingBraceIndex + 1, index),
          end: index,
        };
      }
    }
  }

  return null;
}

function splitTopLevelDeclarations(body: string) {
  const declarations: string[] = [];
  let current = "";
  let paren = 0;
  let bracket = 0;
  let brace = 0;
  let angle = 0;
  let quote: string | null = null;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    const previous = body[index - 1];

    if (quote) {
      current += char;
      if (char === quote && previous !== "\\") quote = null;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      current += char;
      continue;
    }

    if (char === "(") paren += 1;
    if (char === ")") paren = Math.max(0, paren - 1);
    if (char === "[") bracket += 1;
    if (char === "]") bracket = Math.max(0, bracket - 1);
    if (char === "{") brace += 1;
    if (char === "}") brace = Math.max(0, brace - 1);
    if (char === "<") angle += 1;
    if (char === ">") angle = Math.max(0, angle - 1);

    const isTopLevel = paren === 0 && bracket === 0 && brace === 0 && angle === 0;

    if (char === ";" && isTopLevel) {
      if (current.trim()) declarations.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) declarations.push(current.trim());
  return declarations;
}

function parseProps(body: string): ApiProp[] {
  const withoutComments = body
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  return splitTopLevelDeclarations(withoutComments)
    .map((entry) => {
      const normalized = entry.replace(/\s+/g, " ").trim();
      const match = normalized.match(/^([A-Za-z_$][\w$]*)(\?)?\s*:\s*([\s\S]+)$/);

      if (!match) return null;

      return {
        name: match[1],
        optional: Boolean(match[2]),
        type: match[3].trim(),
      } satisfies ApiProp;
    })
    .filter((value): value is ApiProp => Boolean(value));
}

export function extractApiDeclarations(source: string): ApiDeclaration[] {
  if (!source) return [];

  const declarations: ApiDeclaration[] = [];
  const seen = new Set<string>();

  const interfacePattern =
    /(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)\s*(?:extends\s+([^\{]+))?\s*\{/g;

  let match: RegExpExecArray | null;

  while ((match = interfacePattern.exec(source)) !== null) {
    const openIndex = source.indexOf("{", match.index);
    const block = findBalancedBlock(source, openIndex);
    if (!block) continue;

    const key = `interface:${match[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      declarations.push({
        name: match[1],
        kind: "interface",
        extendsType: match[2]?.replace(/\s+/g, " ").trim(),
        props: parseProps(block.body),
      });
    }

    interfacePattern.lastIndex = block.end + 1;
  }

  const inlineFcPattern =
    /export\s+const\s+([A-Za-z_$][\w$]*)\s*:\s*React\.FC<\s*\{/g;

  while ((match = inlineFcPattern.exec(source)) !== null) {
    const openIndex = source.indexOf("{", match.index);
    const block = findBalancedBlock(source, openIndex);
    if (!block) continue;

    const key = `inline:${match[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      declarations.push({
        name: `${match[1]} props`,
        kind: "inline-props",
        props: parseProps(block.body),
      });
    }

    inlineFcPattern.lastIndex = block.end + 1;
  }

  const inlineFunctionPattern =
    /export\s+function\s+([A-Za-z_$][\w$]*)\s*\(\s*\{[\s\S]*?\}\s*:\s*\{/g;

  while ((match = inlineFunctionPattern.exec(source)) !== null) {
    const openIndex = source.indexOf("{", match.index + match[0].lastIndexOf(":"));
    const block = findBalancedBlock(source, openIndex);
    if (!block) continue;

    const key = `function:${match[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      declarations.push({
        name: `${match[1]} props`,
        kind: "inline-props",
        props: parseProps(block.body),
      });
    }
  }

  const typePattern =
    /export\s+type\s+([A-Za-z_$][\w$]*)\s*=\s*([^;]+);/g;

  while ((match = typePattern.exec(source)) !== null) {
    const key = `type:${match[1]}`;
    if (!seen.has(key)) {
      seen.add(key);
      declarations.push({
        name: match[1],
        kind: "type",
        definition: match[2].replace(/\s+/g, " ").trim(),
      });
    }
  }

  return declarations;
}
