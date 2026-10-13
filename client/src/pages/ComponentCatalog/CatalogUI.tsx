import React, { createContext, useContext, useMemo, useRef, useState } from "react";
import {
  Check,
  Clipboard,
  Code2,
  ExternalLink,
  FileCode2,
  Focus,
  GitBranch,
  Keyboard,
  ListTree,
  Monitor,
  RotateCcw,
  Search,
  Smartphone,
  Tablet,
  Trash2,
} from "lucide-react";
import {
  extractApiDeclarations,
  getComponentSources,
} from "./catalogSource";
import { getComponentUsage } from "./catalogUsage";
import { getKeyboardProfile } from "./catalogKeyboard";
import styles from "./ComponentCatalog.module.css";

export type CatalogCategory =
  | "Actions"
  | "Forms"
  | "Display"
  | "Surfaces"
  | "Navigation"
  | "Feedback"
  | "Data"
  | "Layout";

export type CatalogEntry = {
  id: string;
  title: string;
  category: CatalogCategory;
  description: string;
  moduleName: string;
  keywords?: string[];
  component: React.ComponentType;
};

type ViewportMode = "responsive" | "tablet" | "mobile";
type StoryTab = "preview" | "usage" | "keyboard" | "api" | "source";

const StoryResetContext = createContext<(() => void) | null>(null);

export function ResettableStory({ Story }: { Story: React.ComponentType }) {
  const [revision, setRevision] = useState(0);

  return (
    <StoryResetContext.Provider value={() => setRevision((value) => value + 1)}>
      <Story key={revision} />
    </StoryResetContext.Provider>
  );
}

function UsageExplorer({ moduleName }: { moduleName: string }) {
  const summary = useMemo(() => getComponentUsage(moduleName), [moduleName]);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "application" | "shared">("all");

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = summary.usages.filter((usage) => {
    if (scope !== "all" && usage.kind !== scope) return false;
    if (!normalizedQuery) return true;

    return [
      usage.sourcePath,
      usage.area,
      usage.feature,
      ...usage.symbols.flatMap((symbol) => [
        symbol.exportedName,
        symbol.localName,
      ]),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  const grouped = filtered.reduce<Record<string, typeof filtered>>(
    (groups, usage) => {
      const key = usage.area;
      if (!groups[key]) groups[key] = [];
      groups[key].push(usage);
      return groups;
    },
    {},
  );

  const githubUrl = (sourcePath: string, line: number) =>
    "https://github.com/Litwebs/Levants-server/blob/feature/component-catalog/client/src/" +
    sourcePath +
    "#L" +
    line;

  return (
    <div className={styles.usageExplorer}>
      <div className={styles.usageSummaryGrid}>
        <div>
          <strong>{summary.applicationFiles}</strong>
          <span>application files</span>
        </div>
        <div>
          <strong>{summary.sharedFiles}</strong>
          <span>shared dependencies</span>
        </div>
        <div>
          <strong>{summary.references}</strong>
          <span>source references</span>
        </div>
        <div>
          <strong>{summary.areas}</strong>
          <span>code areas</span>
        </div>
      </div>

      <div className={styles.usageExplorerToolbar}>
        <label className={styles.usageSearch}>
          <Search size={14} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter files, features or exported symbols..."
          />
        </label>

        <div className={styles.usageScope}>
          {[
            ["all", "All"],
            ["application", "Application"],
            ["shared", "Shared"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={scope === value ? styles.usageScopeActive : ""}
              onClick={() => setScope(value as typeof scope)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.usageLegend}>
        <span>
          Exports:{" "}
          {summary.exportedSymbols.map((symbol) => (
            <code key={symbol}>{symbol}</code>
          ))}
        </span>
        <span>
          Reference counts are static identifier occurrences, not runtime render
          counts.
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyPanel}>
          No source usages match the current filter.
        </div>
      ) : (
        <div className={styles.usageGroups}>
          {Object.entries(grouped).map(([area, usages]) => (
            <section className={styles.usageGroup} key={area}>
              <div className={styles.usageGroupHeader}>
                <div>
                  <ListTree size={14} />
                  <strong>{area}</strong>
                </div>
                <span>{usages.length} file{usages.length === 1 ? "" : "s"}</span>
              </div>

              <div className={styles.usageRows}>
                {usages.map((usage) => (
                  <div className={styles.usageRow} key={usage.sourcePath}>
                    <div className={styles.usageFile}>
                      <div className={styles.usageFileHeading}>
                        <strong>{usage.feature}</strong>
                        <span>{usage.file}</span>
                      </div>
                      <code>{usage.sourcePath}</code>
                    </div>

                    <div className={styles.usageSymbols}>
                      {usage.symbols.map((symbol) => (
                        <span
                          key={symbol.exportedName + ":" + symbol.localName}
                          title={
                            symbol.localName === symbol.exportedName
                              ? symbol.exportedName
                              : symbol.exportedName + " as " + symbol.localName
                          }
                        >
                          <code>{symbol.localName}</code>
                          <small>{symbol.references}</small>
                        </span>
                      ))}
                    </div>

                    <div className={styles.usageMeta}>
                      {usage.importStyles.map((style) => (
                        <span key={style}>{style}</span>
                      ))}
                      <strong>{usage.references} refs</strong>
                    </div>

                    <a
                      className={styles.usageSourceLink}
                      href={githubUrl(usage.sourcePath, usage.importLine)}
                      target="_blank"
                      rel="noreferrer"
                      title="Open this usage on GitHub"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function describeFocusable(element: HTMLElement) {
  const tag = element.tagName.toLowerCase();
  const ariaLabel = element.getAttribute("aria-label");
  const text = element.textContent?.trim().replace(/\s+/g, " ").slice(0, 60);
  const name = ariaLabel || text || element.getAttribute("name") || element.id;

  return name ? tag + ' "' + name + '"' : tag;
}

function KeyboardTestPanel({
  moduleName,
  children,
}: {
  moduleName: string;
  children: React.ReactNode;
}) {
  const profile = useMemo(() => getKeyboardProfile(moduleName), [moduleName]);
  const testSurfaceRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState("Nothing focused");
  const [focusOrder, setFocusOrder] = useState<string[]>([]);
  const [events, setEvents] = useState<
    Array<{
      id: number;
      key: string;
      target: string;
      modifiers: string;
      prevented: boolean;
    }>
  >([]);

  const focusSelector = [
    "button:not([disabled])",
    "[href]",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    '[tabindex]:not([tabindex="-1"])',
  ].join(",");

  const scanFocusOrder = () => {
    const elements = Array.from(
      testSurfaceRef.current?.querySelectorAll<HTMLElement>(focusSelector) ?? [],
    ).filter((element) => {
      const style = window.getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    });

    setFocusOrder(elements.map(describeFocusable));
    return elements;
  };

  const focusFirst = () => {
    const elements = scanFocusOrder();
    elements[0]?.focus();
  };

  return (
    <div className={styles.keyboardPanel}>
      <div className={styles.keyboardGuide}>
        <div className={styles.keyboardGuideHeader}>
          <div>
            <Keyboard size={18} />
            <div>
              <strong>{profile.title}</strong>
              <span>Use your physical keyboard against the real rendered component.</span>
            </div>
          </div>

          <div className={styles.keyboardActions}>
            <button type="button" onClick={focusFirst}>
              <Focus size={13} />
              Focus first control
            </button>
            <button type="button" onClick={scanFocusOrder}>
              <ListTree size={13} />
              Scan focus order
            </button>
            <button type="button" onClick={() => setEvents([])}>
              <Trash2 size={13} />
              Clear log
            </button>
          </div>
        </div>

        {profile.checks.length ? (
          <div className={styles.keyboardChecks}>
            {profile.checks.map((check, index) => (
              <div className={styles.keyboardCheck} key={index}>
                <div className={styles.keySequence}>
                  {check.keys.map((key) => (
                    <kbd key={key}>{key === " " ? "Space" : key}</kbd>
                  ))}
                </div>
                <p>{check.expected}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.keyboardNoInteraction}>
            This component is not expected to receive keyboard interaction
            itself.
          </div>
        )}

        <div className={styles.keyboardObservations}>
          <strong>Source observations</strong>
          {profile.observations.map((observation) => (
            <p key={observation}>{observation}</p>
          ))}
        </div>
      </div>

      <div className={styles.keyboardWorkspace}>
        <div
          ref={testSurfaceRef}
          className={styles.keyboardTestSurface}
          onFocusCapture={(event) =>
            setFocused(describeFocusable(event.target as HTMLElement))
          }
          onKeyDownCapture={(event) => {
            const modifiers = [
              event.shiftKey ? "Shift" : "",
              event.ctrlKey ? "Ctrl" : "",
              event.altKey ? "Alt" : "",
              event.metaKey ? "Meta" : "",
            ]
              .filter(Boolean)
              .join("+");

            setEvents((current) => [
              {
                id: Date.now() + Math.random(),
                key: event.key === " " ? "Space" : event.key,
                target: describeFocusable(event.target as HTMLElement),
                modifiers,
                prevented: event.defaultPrevented,
              },
              ...current,
            ].slice(0, 20));
          }}
        >
          <div className={styles.keyboardSurfaceLabel}>Interactive test surface</div>
          <div className={styles.keyboardRenderedComponent}>{children}</div>
        </div>

        <aside className={styles.keyboardInspector}>
          <div className={styles.keyboardInspectorBlock}>
            <span>Currently focused</span>
            <strong>{focused}</strong>
          </div>

          <div className={styles.keyboardInspectorBlock}>
            <div className={styles.keyboardInspectorHeading}>
              <span>Focus order</span>
              <small>{focusOrder.length}</small>
            </div>
            {focusOrder.length ? (
              <ol className={styles.focusOrderList}>
                {focusOrder.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ol>
            ) : (
              <p>Run “Scan focus order” to inspect tabbable descendants.</p>
            )}
          </div>

          <div className={styles.keyboardInspectorBlock}>
            <div className={styles.keyboardInspectorHeading}>
              <span>Key event log</span>
              <small>{events.length}</small>
            </div>
            {events.length ? (
              <div className={styles.keyEventLog}>
                {events.map((entry) => (
                  <div key={entry.id}>
                    <kbd>
                      {entry.modifiers
                        ? entry.modifiers + "+" + entry.key
                        : entry.key}
                    </kbd>
                    <span>{entry.target}</span>
                    {entry.prevented ? <small>prevented</small> : null}
                  </div>
                ))}
              </div>
            ) : (
              <p>Focus the test surface and press keys to record events.</p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

export function CatalogStory({
  title,
  description,
  moduleName,
  controls,
  children,
  code,
}: {
  title: string;
  description: string;
  moduleName: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
  code?: string;
}) {
  const [tab, setTab] = useState<StoryTab>("preview");
  const [viewport, setViewport] = useState<ViewportMode>("responsive");
  const [sourceTab, setSourceTab] = useState<"tsx" | "css">("tsx");
  const [copied, setCopied] = useState(false);
  const resetStory = useContext(StoryResetContext);

  const sources = useMemo(() => getComponentSources(moduleName), [moduleName]);
  const api = useMemo(
    () => extractApiDeclarations(sources.tsx),
    [sources.tsx],
  );

  const copyCode = async () => {
    if (!code) return;

    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const frameClass = [
    styles.previewFrame,
    viewport === "tablet" ? styles.previewTablet : "",
    viewport === "mobile" ? styles.previewMobile : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className={styles.story} id={title.toLowerCase().replace(/\s+/g, "-")}>
      <div className={styles.storyHeader}>
        <div>
          <div className={styles.storyTitleRow}>
            <h3>{title}</h3>
            <code>{moduleName}</code>
          </div>
          <p>{description}</p>
        </div>

        <div className={styles.storyTabs} role="tablist" aria-label={title + " views"}>
          <button
            type="button"
            className={tab === "preview" ? styles.activeTab : ""}
            onClick={() => setTab("preview")}
          >
            <Monitor size={14} />
            Preview
          </button>
          <button
            type="button"
            className={tab === "usage" ? styles.activeTab : ""}
            onClick={() => setTab("usage")}
          >
            <GitBranch size={14} />
            Usage
          </button>
          <button
            type="button"
            className={tab === "keyboard" ? styles.activeTab : ""}
            onClick={() => setTab("keyboard")}
          >
            <Keyboard size={14} />
            Keyboard
          </button>
          <button
            type="button"
            className={tab === "api" ? styles.activeTab : ""}
            onClick={() => setTab("api")}
          >
            <Code2 size={14} />
            API
          </button>
          <button
            type="button"
            className={tab === "source" ? styles.activeTab : ""}
            onClick={() => setTab("source")}
          >
            <FileCode2 size={14} />
            Source
          </button>
        </div>
      </div>

      {tab === "preview" ? (
        <>
          <div className={styles.storyToolbar}>
            {resetStory ? (
              <button
                type="button"
                className={styles.resetStoryButton}
                onClick={resetStory}
              >
                <RotateCcw size={13} />
                Reset component
              </button>
            ) : null}
            <span>Preview width</span>
            <div className={styles.viewportControls}>
              <button
                type="button"
                aria-label="Responsive width"
                title="Responsive"
                className={viewport === "responsive" ? styles.activeViewport : ""}
                onClick={() => setViewport("responsive")}
              >
                <Monitor size={15} />
              </button>
              <button
                type="button"
                aria-label="Tablet width"
                title="Tablet"
                className={viewport === "tablet" ? styles.activeViewport : ""}
                onClick={() => setViewport("tablet")}
              >
                <Tablet size={15} />
              </button>
              <button
                type="button"
                aria-label="Mobile width"
                title="Mobile"
                className={viewport === "mobile" ? styles.activeViewport : ""}
                onClick={() => setViewport("mobile")}
              >
                <Smartphone size={15} />
              </button>
            </div>
          </div>

          <div className={styles.storyWorkspace}>
            <div className={styles.previewStage}>
              <div className={frameClass}>{children}</div>
            </div>
            {controls ? (
              <aside className={styles.controlsPanel}>
                <div className={styles.controlsHeading}>Component controls</div>
                {controls}
              </aside>
            ) : null}
          </div>

          {code ? (
            <div className={styles.usagePanel}>
              <div className={styles.usageHeader}>
                <span>Current JSX</span>
                <button type="button" onClick={copyCode}>
                  {copied ? <Check size={14} /> : <Clipboard size={14} />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <pre><code>{code}</code></pre>
            </div>
          ) : null}
        </>
      ) : null}

      {tab === "usage" ? <UsageExplorer moduleName={moduleName} /> : null}

      {tab === "keyboard" ? (
        <KeyboardTestPanel moduleName={moduleName}>
          {children}
        </KeyboardTestPanel>
      ) : null}

      {tab === "api" ? (
        <div className={styles.apiPanel}>
          {api.length === 0 ? (
            <div className={styles.emptyPanel}>
              No named prop declarations were detected. Use the Source tab for the complete implementation.
            </div>
          ) : (
            api.map((declaration) => (
              <div className={styles.apiDeclaration} key={declaration.kind + declaration.name}>
                <div className={styles.apiDeclarationHeader}>
                  <strong>{declaration.name}</strong>
                  <span>{declaration.kind}</span>
                  {declaration.extendsType ? (
                    <code>extends {declaration.extendsType}</code>
                  ) : null}
                </div>

                {declaration.definition ? (
                  <pre className={styles.typeDefinition}><code>{declaration.definition}</code></pre>
                ) : null}

                {declaration.props?.length ? (
                  <div className={styles.apiTableWrap}>
                    <table className={styles.apiTable}>
                      <thead>
                        <tr>
                          <th>Property</th>
                          <th>Required</th>
                          <th>Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {declaration.props.map((prop) => (
                          <tr key={prop.name}>
                            <td><code>{prop.name}</code></td>
                            <td>{prop.optional ? "No" : "Yes"}</td>
                            <td><code>{prop.type}</code></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : null}

      {tab === "source" ? (
        <div className={styles.sourcePanel}>
          <div className={styles.sourceTabs}>
            <button
              type="button"
              className={sourceTab === "tsx" ? styles.activeSourceTab : ""}
              onClick={() => setSourceTab("tsx")}
            >
              {moduleName}.tsx
            </button>
            <button
              type="button"
              disabled={!sources.css}
              className={sourceTab === "css" ? styles.activeSourceTab : ""}
              onClick={() => setSourceTab("css")}
            >
              CSS module
            </button>
          </div>
          <pre className={styles.sourceCode}>
            <code>{sourceTab === "tsx" ? sources.tsx : sources.css || "No CSS module found."}</code>
          </pre>
        </div>
      ) : null}
    </section>
  );
}

export function ControlGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.controlGroup}>
      <span className={styles.controlLabel}>{label}</span>
      {children}
    </div>
  );
}

export function TextControl({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className={styles.controlField}>
      <span>{label}</span>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function NumberControl({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className={styles.controlField}>
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

export function SelectControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<string | { label: string; value: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className={styles.controlField}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => {
          const resolved =
            typeof option === "string"
              ? { label: option, value: option }
              : option;

          return (
            <option key={resolved.value} value={resolved.value}>
              {resolved.label}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function BooleanControl({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={styles.booleanControl}>
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
