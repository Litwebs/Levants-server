import React, { createContext, useContext, useMemo, useState } from "react";
import {
  Check,
  Clipboard,
  Code2,
  FileCode2,
  Monitor,
  Smartphone,
  Tablet,
} from "lucide-react";
import {
  extractApiDeclarations,
  getComponentSources,
} from "./catalogSource";
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
type StoryTab = "preview" | "api" | "source";

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
  const [copied, setCopied] = useState(false);\n  const resetStory = useContext(StoryResetContext);

  const sources = useMemo(() => getComponentSources(moduleName), [moduleName]);
  const api = useMemo(
    () => extractApiDeclarations(sources.tsx),
    [sources.tsx],
  );

  const copyCode = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
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
                <span>Current usage</span>
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
