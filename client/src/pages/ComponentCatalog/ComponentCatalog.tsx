import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Component,
  FileCode2,
  Search,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { catalogEntries, categoryOrder } from "./CatalogStories";
import { ResettableStory } from "./CatalogUI";
import {
  getComponentSources,
  getExportedCommonModules,
  getVariablesSource,
} from "./catalogSource";
import styles from "./ComponentCatalog.module.css";

type Token = {
  name: string;
  value: string;
};

function readRootTokens(source: string): Token[] {
  const rootMatch = source.match(/:root\s*\{([\s\S]*?)\n\}/);
  if (!rootMatch) return [];

  const tokens: Token[] = [];
  const pattern = /(--[\w-]+)\s*:\s*([^;]+);/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(rootMatch[1])) !== null) {
    tokens.push({
      name: match[1],
      value: match[2].trim(),
    });
  }

  return tokens;
}

function FoundationsPanel() {
  const source = getVariablesSource();
  const tokens = useMemo(() => readRootTokens(source), [source]);
  const colors = tokens.filter((token) => token.name.startsWith("--color-"));
  const spacing = tokens.filter((token) => token.name.startsWith("--space-"));
  const radii = tokens.filter((token) => token.name.startsWith("--radius-"));
  const typography = tokens.filter(
    (token) =>
      token.name.startsWith("--font-") ||
      token.name.startsWith("--text-") ||
      token.name.startsWith("--leading-"),
  );

  return (
    <section className={styles.foundationSection} id="foundations">
      <div className={styles.sectionHeading}>
        <div>
          <span>Foundations</span>
          <h2>Live design tokens</h2>
          <p>
            These values are read from <code>src/styles/variables.css</code>, so this
            page documents the same tokens the shared components consume.
          </p>
        </div>
        <FileCode2 size={22} />
      </div>

      <div className={styles.tokenGrid}>
        <div className={styles.tokenPanel}>
          <div className={styles.tokenPanelHeader}>
            <strong>Colour tokens</strong>
            <span>{colors.length}</span>
          </div>
          <div className={styles.colorGrid}>
            {colors.map((token) => (
              <div className={styles.colorToken} key={token.name}>
                <span
                  className={styles.colorSwatch}
                  style={{ background: `var(${token.name})` }}
                />
                <div>
                  <code>{token.name}</code>
                  <span>{token.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.tokenPanel}>
          <div className={styles.tokenPanelHeader}>
            <strong>Spacing scale</strong>
            <span>{spacing.length}</span>
          </div>
          <div className={styles.scaleList}>
            {spacing.map((token) => (
              <div className={styles.scaleRow} key={token.name}>
                <code>{token.name}</code>
                <span
                  className={styles.spacingBar}
                  style={{ width: `min(calc(var(${token.name}) * 3), 160px)` }}
                />
                <span>{token.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.tokenPanel}>
          <div className={styles.tokenPanelHeader}>
            <strong>Radius scale</strong>
            <span>{radii.length}</span>
          </div>
          <div className={styles.radiusGrid}>
            {radii.map((token) => (
              <div className={styles.radiusToken} key={token.name}>
                <span style={{ borderRadius: `var(${token.name})` }} />
                <code>{token.name}</code>
                <small>{token.value}</small>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.tokenPanel}>
          <div className={styles.tokenPanelHeader}>
            <strong>Typography</strong>
            <span>{typography.length}</span>
          </div>
          <div className={styles.typeTokenList}>
            {typography.map((token) => (
              <div key={token.name}>
                <code>{token.name}</code>
                <span>{token.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function ComponentCatalog() {
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.getAttribute("data-theme");
    const previousColorScheme = root.style.colorScheme;

    root.setAttribute("data-theme", "light");
    root.style.colorScheme = "light";

    return () => {
      if (previousTheme === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", previousTheme);

      root.style.colorScheme = previousColorScheme;
    };
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        event.key === "/" &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const exportedModules = useMemo(() => getExportedCommonModules(), []);
  const registeredModules = useMemo(
    () => new Set(catalogEntries.map((entry) => entry.moduleName)),
    [],
  );

  const missingModules = exportedModules.filter(
    (moduleName) => !registeredModules.has(moduleName),
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filteredEntries = catalogEntries.filter((entry) => {
    if (!normalizedQuery) return true;

    const sourceText = getComponentSources(entry.moduleName).tsx;

    return [
      entry.title,
      entry.category,
      entry.description,
      entry.moduleName,
      ...(entry.keywords ?? []),
      sourceText,
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  const grouped = categoryOrder
    .map((category) => ({
      category,
      entries: filteredEntries.filter((entry) => entry.category === category),
    }))
    .filter((group) => group.entries.length > 0);

  const coveragePercent =
    exportedModules.length === 0
      ? 100
      : Math.round(
          ((exportedModules.length - missingModules.length) /
            exportedModules.length) *
            100,
        );

  return (
    <div className={styles.catalogRoot}>
      <header className={styles.topBar}>
        <div className={styles.brandBlock}>
          <span className={styles.brandMark}>
            <Component size={18} />
          </span>
          <div>
            <strong>Levants Component Lab</strong>
            <span>Internal design-system workbench</span>
          </div>
        </div>

        <Link className={styles.backLink} to="/">
          <ArrowLeft size={15} />
          Back to admin
        </Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.heroEyebrow}>
            <ShieldCheck size={15} />
            Admin-only · light-mode isolated
          </div>
          <h1>Build, inspect and stress-test the shared UI.</h1>
          <p>
            Every preview below renders the real component from
            <code> src/components/common</code>. API tables and source views are
            derived from the component files in the browser build, not copied into
            separate documentation.
          </p>
        </div>

        <div className={styles.heroStats}>
          <div>
            <strong>{catalogEntries.length}</strong>
            <span>interactive modules</span>
          </div>
          <div>
            <strong>{exportedModules.length}</strong>
            <span>barrel exports</span>
          </div>
          <div>
            <strong>{coveragePercent}%</strong>
            <span>catalog coverage</span>
          </div>
        </div>
      </section>

      {missingModules.length > 0 ? (
        <div className={styles.coverageWarning}>
          <TriangleAlert size={18} />
          <div>
            <strong>Shared components missing from the catalog</strong>
            <p>
              {missingModules.join(", ")}. The catalog intentionally exposes this
              instead of silently becoming stale.
            </p>
          </div>
        </div>
      ) : (
        <div className={styles.coverageSuccess}>
          <CheckCircle2 size={17} />
          All modules exported by <code>components/common/index.ts</code> have an
          interactive catalog entry.
        </div>
      )}

      <div className={styles.catalogLayout}>
        <aside className={styles.sidebar}>
          <div className={styles.searchBox}>
            <Search size={16} />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search components or props..."
              aria-label="Search component catalog"
            />
            <kbd>/</kbd>
          </div>

          {!normalizedQuery ? (
            <a className={styles.foundationLink} href="#foundations">
              <span>Foundations</span>
              <small>tokens</small>
            </a>
          ) : null}

          <nav className={styles.sidebarNav}>
            {grouped.map((group) => (
              <div className={styles.sidebarGroup} key={group.category}>
                <div className={styles.sidebarGroupTitle}>
                  <span>{group.category}</span>
                  <small>{group.entries.length}</small>
                </div>
                {group.entries.map((entry) => (
                  <a key={entry.id} href={"#" + entry.title.toLowerCase().replace(/\s+/g, "-")}>
                    {entry.title}
                  </a>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <main className={styles.mainContent}>
          {!normalizedQuery ? <FoundationsPanel /> : null}

          {grouped.length === 0 ? (
            <div className={styles.noResults}>
              <Search size={28} />
              <h2>No matching components</h2>
              <p>Try a component name, category, state or common UI term.</p>
              <button type="button" onClick={() => setQuery("")}>Clear search</button>
            </div>
          ) : (
            grouped.map((group) => (
              <section
                className={styles.categorySection}
                key={group.category}
                id={"category-" + group.category.toLowerCase()}
              >
                <div className={styles.categoryHeading}>
                  <div>
                    <span>{group.category}</span>
                    <h2>{group.category}</h2>
                  </div>
                  <small>{group.entries.length} component{group.entries.length === 1 ? "" : "s"}</small>
                </div>

                {group.entries.map((entry) => (
                  <ResettableStory key={entry.id} Story={entry.component} />
                ))}
              </section>
            ))
          )}
        </main>
      </div>
    </div>
  );
}
