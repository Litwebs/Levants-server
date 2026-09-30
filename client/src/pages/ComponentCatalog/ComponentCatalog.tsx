import React, { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  CreateSearch,
  DataTableCard,
  FiltersCardLayout,
  FormGrid,
  FormRow,
  FormSection,
  FormValue,
  Input,
  LoadingScreen,
  Modal,
  ModalFooter,
  PageToolbar,
  Select,
  Skeleton,
  SkeletonText,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TagFilters,
  ToolbarEnd,
  ToolbarStart,
} from "@/components/common";
import { useToast } from "@/components/common/Toast";
import { Search, Plus, Mail, ChevronRight } from "lucide-react";
import styles from "./ComponentCatalog.module.css";

type PropDoc = {
  name: string;
  type: string;
  defaultValue?: string;
  description: string;
};

const propDocs: Record<string, PropDoc[]> = {
  Button: [
    { name: "variant", type: '"primary" | "secondary" | "outline" | "ghost" | "danger"', defaultValue: "primary", description: "Visual style." },
    { name: "size", type: '"sm" | "md" | "lg"', defaultValue: "md", description: "Control height and padding." },
    { name: "isLoading", type: "boolean", defaultValue: "false", description: "Shows spinner and disables interaction." },
    { name: "leftIcon", type: "ReactNode", description: "Icon before the label." },
    { name: "rightIcon", type: "ReactNode", description: "Icon after the label." },
    { name: "fullWidth", type: "boolean", defaultValue: "false", description: "Stretches to container width." },
    { name: "...button props", type: "ButtonHTMLAttributes", description: "Supports native button attributes." },
  ],
  Input: [
    { name: "label", type: "string", description: "Visible field label." },
    { name: "error", type: "string", description: "Error message and error border." },
    { name: "hint", type: "string", description: "Helper text shown when there is no error." },
    { name: "leftIcon", type: "ReactNode", description: "Leading icon." },
    { name: "rightIcon", type: "ReactNode", description: "Trailing icon." },
    { name: "fullWidth", type: "boolean", defaultValue: "false", description: "Stretches to container width." },
    { name: "...input props", type: "InputHTMLAttributes", description: "Supports native input attributes." },
  ],
  Select: [
    { name: "label", type: "string", description: "Visible field label." },
    { name: "error", type: "string", description: "Error message and error border." },
    { name: "options", type: "{ value; label }[]", description: "Available options." },
    { name: "placeholder", type: "string", description: "Disabled placeholder option." },
    { name: "fullWidth", type: "boolean", defaultValue: "false", description: "Stretches to container width." },
    { name: "onChange", type: "(value: string) => void", description: "Returns the selected value." },
  ],
  Badge: [
    { name: "variant", type: '"default" | "success" | "warning" | "error" | "info" | "outline"', defaultValue: "default", description: "Semantic color." },
    { name: "size", type: '"sm" | "md"', defaultValue: "sm", description: "Badge size." },
    { name: "dot", type: "boolean", defaultValue: "false", description: "Shows status dot." },
  ],
  Card: [
    { name: "padding", type: '"none" | "sm" | "md" | "lg"', defaultValue: "md", description: "Internal padding." },
    { name: "hover", type: "boolean", defaultValue: "false", description: "Adds hover lift." },
    { name: "onClick", type: "() => void", description: "Makes the card clickable." },
  ],
  Modal: [
    { name: "isOpen", type: "boolean", description: "Controls visibility." },
    { name: "onClose", type: "() => void", description: "Close callback." },
    { name: "title", type: "string", description: "Modal title." },
    { name: "size", type: '"sm" | "md" | "lg" | "xl" | "full"', defaultValue: "md", description: "Maximum width." },
    { name: "showCloseButton", type: "boolean", defaultValue: "true", description: "Shows header close button." },
  ],
  Tabs: [
    { name: "defaultValue", type: "string", description: "Initial uncontrolled tab." },
    { name: "value", type: "string", description: "Controlled active tab." },
    { name: "onChange", type: "(value: string) => void", description: "Active tab callback." },
  ],
  Skeleton: [
    { name: "width", type: "string | number", description: "Skeleton width." },
    { name: "height", type: "string | number", description: "Skeleton height." },
    { name: "variant", type: '"text" | "rectangular" | "circular"', defaultValue: "rectangular", description: "Skeleton shape." },
  ],
};

function PropTable({ component }: { component: string }) {
  const props = propDocs[component] ?? [];
  if (!props.length) return null;
  return (
    <div className={styles.propTableWrap}>
      <table className={styles.propTable}>
        <thead>
          <tr><th>Prop</th><th>Type</th><th>Default</th><th>Purpose</th></tr>
        </thead>
        <tbody>
          {props.map((prop) => (
            <tr key={prop.name}>
              <td><code>{prop.name}</code></td>
              <td><code>{prop.type}</code></td>
              <td>{prop.defaultValue ? <code>{prop.defaultValue}</code> : "—"}</td>
              <td>{prop.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Playground({
  title,
  description,
  controls,
  children,
  docs,
}: {
  title: string;
  description: string;
  controls?: React.ReactNode;
  children: React.ReactNode;
  docs?: string;
}) {
  return (
    <section className={styles.playground} id={title.toLowerCase().replace(/\s+/g, "-")}>
      <div className={styles.playgroundHeader}>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <code className={styles.sourcePath}>components/common/{title}</code>
      </div>
      <div className={styles.workspace}>
        <div className={styles.previewPane}>{children}</div>
        {controls ? <aside className={styles.controlsPane}><h3>Controls</h3>{controls}</aside> : null}
      </div>
      {docs ? <PropTable component={docs} /> : null}
    </section>
  );
}

const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) => (
  <label className={styles.controlRow}>
    <span>{label}</span>
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
  </label>
);

const ControlSelect = ({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) => (
  <label className={styles.controlStack}>
    <span>{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  </label>
);

const ControlInput = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
  <label className={styles.controlStack}>
    <span>{label}</span>
    <input value={value} onChange={(e) => onChange(e.target.value)} />
  </label>
);

export default function ComponentCatalog() {
  const { showToast } = useToast();

  const [buttonVariant, setButtonVariant] = useState("primary");
  const [buttonSize, setButtonSize] = useState("md");
  const [buttonLoading, setButtonLoading] = useState(false);
  const [buttonFullWidth, setButtonFullWidth] = useState(false);
  const [buttonDisabled, setButtonDisabled] = useState(false);
  const [buttonLabel, setButtonLabel] = useState("Save changes");

  const [inputLabel, setInputLabel] = useState("Email address");
  const [inputPlaceholder, setInputPlaceholder] = useState("name@example.com");
  const [inputError, setInputError] = useState("");
  const [inputHint, setInputHint] = useState("We will only use this for account notices.");
  const [inputDisabled, setInputDisabled] = useState(false);
  const [inputIcon, setInputIcon] = useState(true);

  const [selectValue, setSelectValue] = useState("");
  const [selectError, setSelectError] = useState("");
  const [selectDisabled, setSelectDisabled] = useState(false);

  const [badgeVariant, setBadgeVariant] = useState("success");
  const [badgeSize, setBadgeSize] = useState("sm");
  const [badgeDot, setBadgeDot] = useState(true);

  const [cardPadding, setCardPadding] = useState("md");
  const [cardHover, setCardHover] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalSize, setModalSize] = useState("md");
  const [modalClose, setModalClose] = useState(true);

  const [tabValue, setTabValue] = useState("overview");

  const [skeletonVariant, setSkeletonVariant] = useState("rectangular");
  const [skeletonWidth, setSkeletonWidth] = useState("240");
  const [skeletonHeight, setSkeletonHeight] = useState("80");

  const [tag, setTag] = useState("All");
  const [searchValue, setSearchValue] = useState("john");
  const [searchSelected, setSearchSelected] = useState<string | undefined>();

  const [filtersExpanded, setFiltersExpanded] = useState(true);
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);

  const searchOptions = useMemo(() => [
    { id: "1", title: "John Smith", subtitle: "john@example.com" },
    { id: "2", title: "Johnny Evans", subtitle: "johnny@example.com" },
  ], []);

  return (
    <div className={styles.catalogRoot}>
      {showLoadingScreen ? <LoadingScreen label="Catalog loading preview…" /> : null}

      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>Levants design system</span>
          <h1>Component Catalog</h1>
          <p>Live previews of the real components exported from <code>src/components/common</code>. This route is intentionally locked to the light theme.</p>
        </div>
      </header>

      <nav className={styles.nav}>
        {["Inputs", "Display", "Containers", "Navigation", "Feedback", "Data", "Layouts"].map((group) => (
          <a key={group} href={"#" + group.toLowerCase()}>{group}</a>
        ))}
      </nav>

      <main className={styles.content}>
        <div className={styles.category} id="inputs">
          <h2 className={styles.categoryTitle}>Inputs & actions</h2>

          <Playground title="Button" description="Primary application action primitive." docs="Button"
            controls={<>
              <ControlSelect label="variant" value={buttonVariant} options={["primary","secondary","outline","ghost","danger"]} onChange={setButtonVariant} />
              <ControlSelect label="size" value={buttonSize} options={["sm","md","lg"]} onChange={setButtonSize} />
              <ControlInput label="label" value={buttonLabel} onChange={setButtonLabel} />
              <Toggle label="isLoading" checked={buttonLoading} onChange={setButtonLoading} />
              <Toggle label="fullWidth" checked={buttonFullWidth} onChange={setButtonFullWidth} />
              <Toggle label="disabled" checked={buttonDisabled} onChange={setButtonDisabled} />
            </>}>
            <Button
              variant={buttonVariant as any}
              size={buttonSize as any}
              isLoading={buttonLoading}
              fullWidth={buttonFullWidth}
              disabled={buttonDisabled}
              leftIcon={<Plus />}
              rightIcon={<ChevronRight />}
            >
              {buttonLabel}
            </Button>
          </Playground>

          <Playground title="Input" description="Text input with labels, icons, hints and validation." docs="Input"
            controls={<>
              <ControlInput label="label" value={inputLabel} onChange={setInputLabel} />
              <ControlInput label="placeholder" value={inputPlaceholder} onChange={setInputPlaceholder} />
              <ControlInput label="error" value={inputError} onChange={setInputError} />
              <ControlInput label="hint" value={inputHint} onChange={setInputHint} />
              <Toggle label="leftIcon" checked={inputIcon} onChange={setInputIcon} />
              <Toggle label="disabled" checked={inputDisabled} onChange={setInputDisabled} />
            </>}>
            <div className={styles.previewNarrow}>
              <Input
                label={inputLabel}
                placeholder={inputPlaceholder}
                error={inputError || undefined}
                hint={inputHint || undefined}
                leftIcon={inputIcon ? <Mail /> : undefined}
                disabled={inputDisabled}
                fullWidth
              />
            </div>
          </Playground>

          <Playground title="Select" description="Native select wrapper with Levants styling." docs="Select"
            controls={<>
              <ControlSelect label="value" value={selectValue} options={["","active","paused","archived"]} onChange={setSelectValue} />
              <ControlInput label="error" value={selectError} onChange={setSelectError} />
              <Toggle label="disabled" checked={selectDisabled} onChange={setSelectDisabled} />
            </>}>
            <div className={styles.previewNarrow}>
              <Select
                label="Status"
                value={selectValue}
                placeholder="Choose status"
                error={selectError || undefined}
                disabled={selectDisabled}
                fullWidth
                onChange={setSelectValue}
                options={[
                  { value: "active", label: "Active" },
                  { value: "paused", label: "Paused" },
                  { value: "archived", label: "Archived" },
                ]}
              />
            </div>
          </Playground>

          <Playground title="CreateSearch" description="Search input with a selectable suggestions popover."
            controls={<>
              <ControlInput label="value" value={searchValue} onChange={setSearchValue} />
              <Toggle label="showResults" checked={true} onChange={() => {}} />
            </>}>
            <div className={styles.previewNarrow}>
              <CreateSearch
                value={searchValue}
                onChange={setSearchValue}
                options={searchOptions}
                selectedId={searchSelected}
                onSelect={setSearchSelected}
                onClear={() => setSearchValue("")}
                placeholder="Search customers..."
              />
            </div>
          </Playground>
        </div>

        <div className={styles.category} id="display">
          <h2 className={styles.categoryTitle}>Display</h2>
          <Playground title="Badge" description="Compact semantic status label." docs="Badge"
            controls={<>
              <ControlSelect label="variant" value={badgeVariant} options={["default","success","warning","error","info","outline"]} onChange={setBadgeVariant} />
              <ControlSelect label="size" value={badgeSize} options={["sm","md"]} onChange={setBadgeSize} />
              <Toggle label="dot" checked={badgeDot} onChange={setBadgeDot} />
            </>}>
            <Badge variant={badgeVariant as any} size={badgeSize as any} dot={badgeDot}>Active</Badge>
          </Playground>

          <Playground title="Skeleton" description="Loading placeholder primitives." docs="Skeleton"
            controls={<>
              <ControlSelect label="variant" value={skeletonVariant} options={["text","rectangular","circular"]} onChange={setSkeletonVariant} />
              <ControlInput label="width" value={skeletonWidth} onChange={setSkeletonWidth} />
              <ControlInput label="height" value={skeletonHeight} onChange={setSkeletonHeight} />
            </>}>
            <div className={styles.skeletonPreview}>
              <Skeleton variant={skeletonVariant as any} width={Number(skeletonWidth) || skeletonWidth} height={Number(skeletonHeight) || skeletonHeight} />
              <SkeletonText lines={3} />
            </div>
          </Playground>
        </div>

        <div className={styles.category} id="containers">
          <h2 className={styles.categoryTitle}>Containers & overlays</h2>
          <Playground title="Card" description="Reusable content container with header/content/footer subcomponents." docs="Card"
            controls={<>
              <ControlSelect label="padding" value={cardPadding} options={["none","sm","md","lg"]} onChange={setCardPadding} />
              <Toggle label="hover" checked={cardHover} onChange={setCardHover} />
            </>}>
            <Card padding={cardPadding as any} hover={cardHover}>
              <CardHeader action={<Badge variant="success">Live</Badge>}>
                <CardTitle>Customer summary</CardTitle>
                <CardDescription>Real Card primitives composed together.</CardDescription>
              </CardHeader>
              <CardContent>Card body content renders here.</CardContent>
              <CardFooter><Button size="sm">Save</Button><Button size="sm" variant="outline">Cancel</Button></CardFooter>
            </Card>
          </Playground>

          <Playground title="Modal" description="App modal with fixed header, scrollable content and footer." docs="Modal"
            controls={<>
              <ControlSelect label="size" value={modalSize} options={["sm","md","lg","xl","full"]} onChange={setModalSize} />
              <Toggle label="showCloseButton" checked={modalClose} onChange={setModalClose} />
            </>}>
            <Button onClick={() => setModalOpen(true)}>Open modal</Button>
            <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Example modal" size={modalSize as any} showCloseButton={modalClose}>
              <p>This is rendered by the real Levants Modal component.</p>
              <Input label="Example field" placeholder="Type something" fullWidth />
              <ModalFooter>
                <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button onClick={() => setModalOpen(false)}>Confirm</Button>
              </ModalFooter>
            </Modal>
          </Playground>
        </div>

        <div className={styles.category} id="navigation">
          <h2 className={styles.categoryTitle}>Navigation</h2>
          <Playground title="Tabs" description="Controlled or uncontrolled tab system." docs="Tabs">
            <Tabs defaultValue="overview" value={tabValue} onChange={setTabValue}>
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>
              <TabsContent value="overview">Overview content.</TabsContent>
              <TabsContent value="activity">Activity content.</TabsContent>
              <TabsContent value="settings">Settings content.</TabsContent>
            </Tabs>
          </Playground>
        </div>

        <div className={styles.category} id="feedback">
          <h2 className={styles.categoryTitle}>Feedback & loading</h2>
          <Playground title="Toast" description="Global notification system powered by the existing ToastProvider.">
            <div className={styles.buttonRow}>
              <Button size="sm" onClick={() => showToast({ type: "success", title: "Saved", message: "Changes were saved." })}>Success toast</Button>
              <Button size="sm" variant="danger" onClick={() => showToast({ type: "error", title: "Error", message: "Something went wrong." })}>Error toast</Button>
              <Button size="sm" variant="outline" onClick={() => showToast({ type: "warning", title: "Warning", message: "Check this value." })}>Warning toast</Button>
            </div>
          </Playground>

          <Playground title="LoadingScreen" description="Full-screen blocking loader.">
            <Button onClick={() => {
              setShowLoadingScreen(true);
              window.setTimeout(() => setShowLoadingScreen(false), 1200);
            }}>Preview loading screen</Button>
          </Playground>
        </div>

        <div className={styles.category} id="data">
          <h2 className={styles.categoryTitle}>Data display</h2>
          <Playground title="Table" description="Composable table primitives.">
            <Table>
              <TableHeader><TableRow><TableHead sortable sorted="asc">Name</TableHead><TableHead>Status</TableHead><TableHead align="right">Orders</TableHead></TableRow></TableHeader>
              <TableBody>
                <TableRow><TableCell>Amelia Brown</TableCell><TableCell><Badge variant="success">Active</Badge></TableCell><TableCell align="right">28</TableCell></TableRow>
                <TableRow selected><TableCell>James Wilson</TableCell><TableCell><Badge variant="warning">Paused</Badge></TableCell><TableCell align="right">12</TableCell></TableRow>
              </TableBody>
            </Table>
          </Playground>

          <Playground title="DataTableCard" description="Card wrapper for scrollable tables, loading and pagination.">
            <DataTableCard
              pagination={{
                page: 1,
                pageSize: 10,
                total: 24,
                totalPages: 3,
                setPage: () => {},
                setPageSize: () => {},
                pageSizeOptions: [{ value: "10", label: "10 per page" }, { value: "25", label: "25 per page" }],
              }}
            >
              <Table withWrapper={false}>
                <TableHeader><TableRow><TableHead>Customer</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
                <TableBody><TableRow><TableCell>Sarah Jones</TableCell><TableCell><Badge variant="success">Active</Badge></TableCell></TableRow></TableBody>
              </Table>
            </DataTableCard>
          </Playground>
        </div>

        <div className={styles.category} id="layouts">
          <h2 className={styles.categoryTitle}>Layout & composition</h2>

          <Playground title="FormGrid" description="Shared two-column label/control form layout.">
            <FormGrid>
              <FormRow label="Name"><input defaultValue="Alex Morgan" /></FormRow>
              <FormRow label="Email"><input defaultValue="alex@example.com" /></FormRow>
              <FormValue label="Account ID" value="CUS-1042" muted />
              <FormSection title="Address">
                <FormRow label="Town"><input defaultValue="Rochdale" /></FormRow>
              </FormSection>
            </FormGrid>
          </Playground>

          <Playground title="PageToolbar" description="Responsive toolbar with grouped start/end content and tag filters.">
            <PageToolbar>
              <ToolbarStart>
                <Input placeholder="Search..." leftIcon={<Search />} />
                <TagFilters tags={["All","Active","Paused"]} selectedTag={tag} onTagSelect={setTag} />
              </ToolbarStart>
              <ToolbarEnd><Button leftIcon={<Plus />}>Add customer</Button></ToolbarEnd>
            </PageToolbar>
          </Playground>

          <Playground title="FiltersCardLayout" description="Shared card shell for expandable filtering interfaces."
            controls={<Toggle label="isExpanded" checked={filtersExpanded} onChange={setFiltersExpanded} />}>
            <FiltersCardLayout
              isExpanded={filtersExpanded}
              topRow={<div className={styles.filterTop}><Input placeholder="Search..." leftIcon={<Search />} fullWidth /><Button variant="outline" onClick={() => setFiltersExpanded((value) => !value)}>Filters</Button></div>}
              expandedContent={<div className={styles.filterExpanded}><Select label="Status" options={[{value:"all",label:"All"},{value:"active",label:"Active"}]} /><Select label="Category" options={[{value:"all",label:"All"},{value:"retail",label:"Retail"}]} /></div>}
              expandedWrapClassName={styles.expandWrap}
              expandedOpenClassName={styles.expandOpen}
              expandedInnerClassName={styles.expandInner}
            />
          </Playground>
        </div>
      </main>
    </div>
  );
}
