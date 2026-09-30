import { useMemo, useState } from "react";
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
  useToast,
} from "@/components/common";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
  Mail,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  BooleanControl,
  CatalogEntry,
  CatalogStory,
  ControlGroup,
  NumberControl,
  SelectControl,
  TextControl,
} from "./CatalogUI";
import styles from "./ComponentCatalog.module.css";

function ButtonStory() {
  const [variant, setVariant] = useState("primary");
  const [size, setSize] = useState("md");
  const [label, setLabel] = useState("Save changes");
  const [loading, setLoading] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [fullWidth, setFullWidth] = useState(false);
  const [leftIcon, setLeftIcon] = useState(true);
  const [rightIcon, setRightIcon] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);

  const code = `<Button
  variant="${variant}"
  size="${size}"${loading ? "\n  isLoading" : ""}${disabled ? "\n  disabled" : ""}${fullWidth ? "\n  fullWidth" : ""}${leftIcon ? "\n  leftIcon={<Plus />}" : ""}${rightIcon ? "\n  rightIcon={<ChevronRight />}" : ""}
>
  ${label}
</Button>`;

  return (
    <CatalogStory
      title="Button"
      description="The shared action primitive. Test semantic variants, sizes, loading, disabled, width and icon placement."
      moduleName="Button"
      code={code}
      controls={
        <>
          <SelectControl label="variant" value={variant} options={["primary", "secondary", "outline", "ghost", "danger"]} onChange={setVariant} />
          <SelectControl label="size" value={size} options={["sm", "md", "lg"]} onChange={setSize} />
          <TextControl label="children" value={label} onChange={setLabel} />
          <ControlGroup label="State">
            <BooleanControl label="isLoading" checked={loading} onChange={setLoading} />
            <BooleanControl label="disabled" checked={disabled} onChange={setDisabled} />
            <BooleanControl label="fullWidth" checked={fullWidth} onChange={setFullWidth} />
          </ControlGroup>
          <ControlGroup label="Icons">
            <BooleanControl label="leftIcon" checked={leftIcon} onChange={setLeftIcon} />
            <BooleanControl label="rightIcon" checked={rightIcon} onChange={setRightIcon} />
          </ControlGroup>
          <BooleanControl label="show variant matrix" checked={showMatrix} onChange={setShowMatrix} />
        </>
      }
    >
      {showMatrix ? (
        <div className={styles.demoVariantMatrix}>
          {["primary", "secondary", "outline", "ghost", "danger"].map((matrixVariant) => (
            <div className={styles.demoVariantRow} key={matrixVariant}>
              <span>{matrixVariant}</span>
              {["sm", "md", "lg"].map((matrixSize) => (
                <Button key={matrixSize} variant={matrixVariant as any} size={matrixSize as any}>
                  {matrixSize}
                </Button>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.demoConstraint}>
          <Button
            variant={variant as any}
            size={size as any}
            isLoading={loading}
            disabled={disabled}
            fullWidth={fullWidth}
            leftIcon={leftIcon ? <Plus /> : undefined}
            rightIcon={rightIcon ? <ChevronRight /> : undefined}
          >
            {label || "Button"}
          </Button>
        </div>
      )}
    </CatalogStory>
  );
}

function InputStory() {
  const [label, setLabel] = useState("Email address");
  const [placeholder, setPlaceholder] = useState("name@example.com");
  const [value, setValue] = useState("");
  const [hint, setHint] = useState("Used for account notifications.");
  const [error, setError] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [fullWidth, setFullWidth] = useState(true);
  const [leftIcon, setLeftIcon] = useState(true);
  const [rightIcon, setRightIcon] = useState(false);
  const [type, setType] = useState("email");

  const code = `<Input
  type="${type}"
  label="${label}"
  placeholder="${placeholder}"${hint ? `\n  hint="${hint}"` : ""}${error ? `\n  error="${error}"` : ""}${disabled ? "\n  disabled" : ""}${fullWidth ? "\n  fullWidth" : ""}
/>`;

  return (
    <CatalogStory
      title="Input"
      description="Text-entry primitive with native input props, labels, validation, hints and leading/trailing icons."
      moduleName="Input"
      code={code}
      controls={
        <>
          <TextControl label="label" value={label} onChange={setLabel} />
          <TextControl label="placeholder" value={placeholder} onChange={setPlaceholder} />
          <TextControl label="value" value={value} onChange={setValue} />
          <TextControl label="hint" value={hint} onChange={setHint} />
          <TextControl label="error" value={error} onChange={setError} placeholder="Leave empty for no error" />
          <SelectControl label="type" value={type} options={["text", "email", "password", "number", "search"]} onChange={setType} />
          <ControlGroup label="State">
            <BooleanControl label="disabled" checked={disabled} onChange={setDisabled} />
            <BooleanControl label="fullWidth" checked={fullWidth} onChange={setFullWidth} />
            <BooleanControl label="leftIcon" checked={leftIcon} onChange={setLeftIcon} />
            <BooleanControl label="rightIcon" checked={rightIcon} onChange={setRightIcon} />
          </ControlGroup>
        </>
      }
    >
      <div className={styles.demoConstraint}>
        <Input
          type={type}
          label={label || undefined}
          placeholder={placeholder}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          hint={hint || undefined}
          error={error || undefined}
          disabled={disabled}
          fullWidth={fullWidth}
          leftIcon={leftIcon ? <Mail /> : undefined}
          rightIcon={rightIcon ? <CheckCircle2 /> : undefined}
        />
      </div>
    </CatalogStory>
  );
}

function SelectStory() {
  const [label, setLabel] = useState("Status");
  const [value, setValue] = useState("");
  const [placeholder, setPlaceholder] = useState("Choose status");
  const [error, setError] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [fullWidth, setFullWidth] = useState(true);

  return (
    <CatalogStory
      title="Select"
      description="Native select wrapped in Levants styling with labels, validation and value-based change callbacks."
      moduleName="Select"
      code={`<Select
  label="${label}"
  value="${value}"
  placeholder="${placeholder}"
  options={statusOptions}
  onChange={setValue}${error ? `\n  error="${error}"` : ""}${disabled ? "\n  disabled" : ""}${fullWidth ? "\n  fullWidth" : ""}
/>`}
      controls={
        <>
          <TextControl label="label" value={label} onChange={setLabel} />
          <TextControl label="placeholder" value={placeholder} onChange={setPlaceholder} />
          <SelectControl
            label="value"
            value={value}
            options={[
              { label: "Empty", value: "" },
              { label: "Active", value: "active" },
              { label: "Paused", value: "paused" },
              { label: "Archived", value: "archived" },
            ]}
            onChange={setValue}
          />
          <TextControl label="error" value={error} onChange={setError} />
          <BooleanControl label="disabled" checked={disabled} onChange={setDisabled} />
          <BooleanControl label="fullWidth" checked={fullWidth} onChange={setFullWidth} />
        </>
      }
    >
      <div className={styles.demoConstraint}>
        <Select
          label={label || undefined}
          value={value}
          placeholder={placeholder || undefined}
          error={error || undefined}
          disabled={disabled}
          fullWidth={fullWidth}
          onChange={setValue}
          options={[
            { value: "active", label: "Active" },
            { value: "paused", label: "Paused" },
            { value: "archived", label: "Archived" },
          ]}
        />
      </div>
    </CatalogStory>
  );
}

function CreateSearchStory() {
  const [value, setValue] = useState("jo");
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [showResults, setShowResults] = useState(true);
  const [placeholder, setPlaceholder] = useState("Search customers...");

  const options = useMemo(
    () => [
      { id: "cus-001", title: "John Smith", subtitle: "john@example.com" },
      { id: "cus-002", title: "Joanna Patel", subtitle: "joanna@example.com" },
      { id: "cus-003", title: "Joseph Brown", subtitle: "joseph@example.com" },
    ],
    [],
  );

  return (
    <CatalogStory
      title="CreateSearch"
      description="Search-and-select composition used when a create flow needs to resolve an existing entity."
      moduleName="CreateSearch"
      code={`<CreateSearch
  value={query}
  onChange={setQuery}
  options={results}
  selectedId={selectedId}
  onSelect={setSelectedId}${loading ? "\n  loading" : ""}${error ? `\n  error="${error}"` : ""}${disabled ? "\n  disabled" : ""}${showResults ? "" : "\n  showResults={false}"}
/>`}
      controls={
        <>
          <TextControl label="value" value={value} onChange={setValue} />
          <TextControl label="placeholder" value={placeholder} onChange={setPlaceholder} />
          <TextControl label="error" value={error} onChange={setError} />
          <BooleanControl label="loading" checked={loading} onChange={setLoading} />
          <BooleanControl label="disabled" checked={disabled} onChange={setDisabled} />
          <BooleanControl label="showResults" checked={showResults} onChange={setShowResults} />
        </>
      }
    >
      <div className={styles.demoSearchConstraint}>
        <CreateSearch
          value={value}
          onChange={setValue}
          options={options}
          selectedId={selectedId}
          onSelect={setSelectedId}
          loading={loading}
          error={error || null}
          disabled={disabled}
          placeholder={placeholder}
          showResults={showResults}
          onClear={() => setValue("")}
        />
      </div>
    </CatalogStory>
  );
}

function BadgeStory() {
  const [variant, setVariant] = useState("success");
  const [size, setSize] = useState("sm");
  const [dot, setDot] = useState(true);
  const [label, setLabel] = useState("Active");
  const [showMatrix, setShowMatrix] = useState(false);

  return (
    <CatalogStory
      title="Badge"
      description="Compact semantic label for statuses, categories and lightweight metadata."
      moduleName="Badge"
      code={`<Badge variant="${variant}" size="${size}"${dot ? " dot" : ""}>${label}</Badge>`}
      controls={
        <>
          <SelectControl label="variant" value={variant} options={["default", "success", "warning", "error", "info", "outline"]} onChange={setVariant} />
          <SelectControl label="size" value={size} options={["sm", "md"]} onChange={setSize} />
          <TextControl label="children" value={label} onChange={setLabel} />
          <BooleanControl label="dot" checked={dot} onChange={setDot} />
          <BooleanControl label="show variant matrix" checked={showMatrix} onChange={setShowMatrix} />
        </>
      }
    >
      {showMatrix ? (
        <div className={styles.demoBadgeMatrix}>
          {["default", "success", "warning", "error", "info", "outline"].map((matrixVariant) => (
            <div className={styles.demoBadgeRow} key={matrixVariant}>
              <span>{matrixVariant}</span>
              <Badge variant={matrixVariant as any} size="sm">Small</Badge>
              <Badge variant={matrixVariant as any} size="md" dot>Medium</Badge>
            </div>
          ))}
        </div>
      ) : (
        <Badge variant={variant as any} size={size as any} dot={dot}>{label || "Badge"}</Badge>
      )}
    </CatalogStory>
  );
}

function SkeletonStory() {
  const [variant, setVariant] = useState("rectangular");
  const [width, setWidth] = useState(280);
  const [height, setHeight] = useState(96);
  const [lines, setLines] = useState(3);

  return (
    <CatalogStory
      title="Skeleton"
      description="Shimmering loading placeholders, including the dedicated multi-line SkeletonText helper."
      moduleName="Skeleton"
      code={`<Skeleton variant="${variant}" width={${width}} height={${height}} />\n<SkeletonText lines={${lines}} />`}
      controls={
        <>
          <SelectControl label="variant" value={variant} options={["text", "rectangular", "circular"]} onChange={setVariant} />
          <NumberControl label="width" value={width} min={16} max={600} onChange={setWidth} />
          <NumberControl label="height" value={height} min={8} max={300} onChange={setHeight} />
          <NumberControl label="SkeletonText lines" value={lines} min={1} max={8} onChange={setLines} />
        </>
      }
    >
      <div className={styles.demoSkeletonStack}>
        <Skeleton variant={variant as any} width={width} height={height} />
        <SkeletonText lines={lines} />
      </div>
    </CatalogStory>
  );
}

function CardStory() {
  const [padding, setPadding] = useState("md");
  const [hover, setHover] = useState(true);
  const [clickable, setClickable] = useState(false);
  const [clicks, setClicks] = useState(0);

  return (
    <CatalogStory
      title="Card"
      description="Surface primitive with composable header, title, description, content and footer helpers."
      moduleName="Card"
      code={`<Card padding="${padding}"${hover ? " hover" : ""}${clickable ? " onClick={handleClick}" : ""}>
  <CardHeader action={<Badge>Live</Badge>}>
    <CardTitle>Customer summary</CardTitle>
    <CardDescription>Reusable surface content.</CardDescription>
  </CardHeader>
  <CardContent>...</CardContent>
  <CardFooter>...</CardFooter>
</Card>`}
      controls={
        <>
          <SelectControl label="padding" value={padding} options={["none", "sm", "md", "lg"]} onChange={setPadding} />
          <BooleanControl label="hover" checked={hover} onChange={setHover} />
          <BooleanControl label="onClick" checked={clickable} onChange={setClickable} />
        </>
      }
    >
      <div className={styles.demoCardConstraint}>
        <Card
          padding={padding as any}
          hover={hover}
          onClick={clickable ? () => setClicks((current) => current + 1) : undefined}
        >
          <CardHeader action={<Badge variant="success">Live</Badge>}>
            <div>
              <CardTitle>Customer summary</CardTitle>
              <CardDescription>Composed from the real Card subcomponents.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className={styles.demoMetricRow}>
              <span>Orders this month</span>
              <strong>24</strong>
            </div>
            {clickable ? <div className={styles.demoClickNote}>Card clicks: {clicks}</div> : null}
          </CardContent>
          <CardFooter>
            <Button size="sm">Open customer</Button>
            <Button size="sm" variant="outline">Dismiss</Button>
          </CardFooter>
        </Card>
      </div>
    </CatalogStory>
  );
}

function ModalStory() {
  const [open, setOpen] = useState(false);
  const [size, setSize] = useState("md");
  const [title, setTitle] = useState("Confirm customer update");
  const [showCloseButton, setShowCloseButton] = useState(true);

  return (
    <CatalogStory
      title="Modal"
      description="Fixed overlay dialog with Escape handling, body-scroll locking, configurable size and a fixed footer slot."
      moduleName="Modal"
      code={`<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="${title}"
  size="${size}"${showCloseButton ? "" : "\n  showCloseButton={false}"}
>
  ...
  <ModalFooter>...</ModalFooter>
</Modal>`}
      controls={
        <>
          <SelectControl label="size" value={size} options={["sm", "md", "lg", "xl", "full"]} onChange={setSize} />
          <TextControl label="title" value={title} onChange={setTitle} />
          <BooleanControl label="showCloseButton" checked={showCloseButton} onChange={setShowCloseButton} />
        </>
      }
    >
      <Button onClick={() => setOpen(true)}>Open actual modal</Button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title={title || undefined}
        size={size as any}
        showCloseButton={showCloseButton}
      >
        <div className={styles.demoModalBody}>
          <p>This is the actual shared Modal, not a visual imitation.</p>
          <Input label="Customer note" placeholder="Add a note..." fullWidth />
          <Input label="Reference" placeholder="Optional reference" fullWidth />
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => setOpen(false)}>Confirm</Button>
        </ModalFooter>
      </Modal>
    </CatalogStory>
  );
}

function TabsStory() {
  const [activeTab, setActiveTab] = useState("overview");

  return (
    <CatalogStory
      title="Tabs"
      description="Context-based controlled/uncontrolled tab primitives: Tabs, TabsList, TabsTrigger and TabsContent."
      moduleName="Tabs"
      code={`<Tabs value="${activeTab}" onChange={setActiveTab} defaultValue="overview">
  <TabsList>
    <TabsTrigger value="overview">Overview</TabsTrigger>
    <TabsTrigger value="activity">Activity</TabsTrigger>
    <TabsTrigger value="settings">Settings</TabsTrigger>
  </TabsList>
  ...
</Tabs>`}
      controls={
        <SelectControl label="value" value={activeTab} options={["overview", "activity", "settings"]} onChange={setActiveTab} />
      }
    >
      <div className={styles.demoWideConstraint}>
        <Tabs defaultValue="overview" value={activeTab} onChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity">Activity</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <Card padding="sm"><strong>Overview</strong><p className={styles.demoParagraph}>Summary information for this record.</p></Card>
          </TabsContent>
          <TabsContent value="activity">
            <Card padding="sm"><strong>Activity</strong><p className={styles.demoParagraph}>Recent changes and events.</p></Card>
          </TabsContent>
          <TabsContent value="settings">
            <Card padding="sm"><strong>Settings</strong><p className={styles.demoParagraph}>Configuration specific to this record.</p></Card>
          </TabsContent>
        </Tabs>
      </div>
    </CatalogStory>
  );
}

function ToastStory() {
  const { showToast } = useToast();
  const [type, setType] = useState("success");
  const [title, setTitle] = useState("Changes saved");
  const [message, setMessage] = useState("The customer record was updated successfully.");
  const [duration, setDuration] = useState(5000);

  return (
    <CatalogStory
      title="Toast"
      description="Global transient notifications rendered by the existing ToastProvider."
      moduleName="Toast"
      code={`showToast({
  type: "${type}",
  title: "${title}",
  message: "${message}",
  duration: ${duration},
});`}
      controls={
        <>
          <SelectControl label="type" value={type} options={["success", "error", "warning", "info"]} onChange={setType} />
          <TextControl label="title" value={title} onChange={setTitle} />
          <TextControl label="message" value={message} onChange={setMessage} />
          <NumberControl label="duration (ms)" value={duration} min={1000} max={15000} onChange={setDuration} />
        </>
      }
    >
      <div className={styles.demoToastButtons}>
        <Button
          onClick={() =>
            showToast({
              type: type as any,
              title: title || "Notification",
              message: message || undefined,
              duration,
            })
          }
        >
          Show configured toast
        </Button>
        <div className={styles.demoInlineNote}>
          <Info size={16} />
          Toasts render in the real global container at the bottom-right of the browser.
        </div>
      </div>
    </CatalogStory>
  );
}

function LoadingScreenStory() {
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState("Loading…");

  const preview = () => {
    setVisible(true);
    window.setTimeout(() => setVisible(false), 1400);
  };

  return (
    <CatalogStory
      title="LoadingScreen"
      description="Full-viewport blocking state used around authentication and app-level transitions."
      moduleName="LoadingScreen"
      code={`<LoadingScreen label="${label}" />`}
      controls={<TextControl label="label" value={label} onChange={setLabel} />}
    >
      {visible ? <LoadingScreen label={label} /> : null}
      <div className={styles.demoToastButtons}>
        <Button onClick={preview}>Preview for 1.4 seconds</Button>
        <div className={styles.demoInlineNote}><AlertTriangle size={16} />This component intentionally covers the entire viewport.</div>
      </div>
    </CatalogStory>
  );
}

function TableStory() {
  const [withWrapper, setWithWrapper] = useState(true);
  const [selectedRow, setSelectedRow] = useState(2);
  const [sort, setSort] = useState<"asc" | "desc">("asc");

  const toggleSort = () => setSort((current) => (current === "asc" ? "desc" : "asc"));

  return (
    <CatalogStory
      title="Table"
      description="Composable table primitives with alignment, sorting affordances, clickable rows and selected state."
      moduleName="Table"
      code={`<Table withWrapper={${withWrapper}}>
  <TableHeader>
    <TableRow>
      <TableHead sortable sorted="${sort}" onSort={toggleSort}>Name</TableHead>
      ...
    </TableRow>
  </TableHeader>
  <TableBody>...</TableBody>
</Table>`}
      controls={
        <>
          <BooleanControl label="withWrapper" checked={withWrapper} onChange={setWithWrapper} />
          <SelectControl label="selected row" value={String(selectedRow)} options={[{label:"None",value:"0"},{label:"Amelia Brown",value:"1"},{label:"James Wilson",value:"2"},{label:"Sarah Jones",value:"3"}]} onChange={(value) => setSelectedRow(Number(value))} />
          <SelectControl label="sorted" value={sort} options={["asc", "desc"]} onChange={(value) => setSort(value as "asc" | "desc")} />
        </>
      }
    >
      <div className={styles.demoWideConstraint}>
        <Table withWrapper={withWrapper}>
          <TableHeader>
            <TableRow>
              <TableHead sortable sorted={sort} onSort={toggleSort}>Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead align="right">Orders</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["Amelia Brown", "Active", "28"],
              ["James Wilson", "Paused", "12"],
              ["Sarah Jones", "Active", "41"],
            ].map((row, index) => (
              <TableRow
                key={row[0]}
                selected={selectedRow === index + 1}
                onClick={() => setSelectedRow(index + 1)}
              >
                <TableCell>{row[0]}</TableCell>
                <TableCell><Badge variant={row[1] === "Active" ? "success" : "warning"}>{row[1]}</Badge></TableCell>
                <TableCell align="right">{row[2]}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </CatalogStory>
  );
}

function DataTableCardStory() {
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(47);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <CatalogStory
      title="DataTableCard"
      description="Production table shell combining Card, loading overlay and controlled pagination."
      moduleName="DataTableCard"
      code={`<DataTableCard
  loading={${loading}}
  pagination={{
    page: ${page},
    pageSize: ${pageSize},
    total: ${total},
    totalPages: ${totalPages},
    setPage,
    setPageSize,
    pageSizeOptions,
  }}
>
  <Table withWrapper={false}>...</Table>
</DataTableCard>`}
      controls={
        <>
          <BooleanControl label="loading" checked={loading} onChange={setLoading} />
          <NumberControl label="page" value={page} min={1} max={totalPages} onChange={(value) => setPage(Math.min(totalPages, Math.max(1, value)))} />
          <SelectControl label="pageSize" value={String(pageSize)} options={["10", "25", "50"]} onChange={(value) => { setPageSize(Number(value)); setPage(1); }} />
          <NumberControl label="total" value={total} min={0} max={500} onChange={(value) => { setTotal(Math.max(0, value)); setPage(1); }} />
        </>
      }
    >
      <div className={styles.demoDataCardConstraint}>
        <DataTableCard
          loading={loading}
          loadingText="Refreshing customers..."
          pagination={{
            page,
            pageSize,
            total,
            totalPages,
            setPage,
            setPageSize,
            pageSizeOptions: [
              { value: "10", label: "10 per page" },
              { value: "25", label: "25 per page" },
              { value: "50", label: "50 per page" },
            ],
          }}
        >
          <Table withWrapper={false}>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead align="right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow><TableCell>Amelia Brown</TableCell><TableCell><Badge variant="success">Active</Badge></TableCell><TableCell align="right">£42.80</TableCell></TableRow>
              <TableRow><TableCell>James Wilson</TableCell><TableCell><Badge variant="warning">Paused</Badge></TableCell><TableCell align="right">£0.00</TableCell></TableRow>
              <TableRow><TableCell>Sarah Jones</TableCell><TableCell><Badge variant="success">Active</Badge></TableCell><TableCell align="right">£18.20</TableCell></TableRow>
            </TableBody>
          </Table>
        </DataTableCard>
      </div>
    </CatalogStory>
  );
}

function FormGridStory() {
  const [viewMode, setViewMode] = useState(false);
  const [name, setName] = useState("Alex Morgan");
  const [email, setEmail] = useState("alex@example.com");
  const [town, setTown] = useState("Rochdale");

  return (
    <CatalogStory
      title="FormGrid"
      description="Shared label/control form layout with responsive FormRow, read-only FormValue and FormSection primitives."
      moduleName="FormGrid"
      code={viewMode
        ? `<FormGrid>
  <FormValue label="Name" value="${name}" />
  <FormValue label="Email" value="${email}" />
</FormGrid>`
        : `<FormGrid>
  <FormRow label="Name"><input value={name} /></FormRow>
  <FormRow label="Email"><input value={email} /></FormRow>
  <FormSection title="Address">...</FormSection>
</FormGrid>`}
      controls={
        <>
          <BooleanControl label="view mode" checked={viewMode} onChange={setViewMode} />
          <TextControl label="name" value={name} onChange={setName} />
          <TextControl label="email" value={email} onChange={setEmail} />
          <TextControl label="town" value={town} onChange={setTown} />
        </>
      }
    >
      <div className={styles.demoFormConstraint}>
        <FormGrid>
          {viewMode ? (
            <>
              <FormValue label="Name" value={name} />
              <FormValue label="Email" value={email} />
              <FormValue label="Account ID" value="CUS-1042" muted />
              <FormSection title="Address">
                <FormValue label="Town" value={town} />
              </FormSection>
            </>
          ) : (
            <>
              <FormRow label="Name"><input value={name} onChange={(event) => setName(event.target.value)} /></FormRow>
              <FormRow label="Email"><input value={email} onChange={(event) => setEmail(event.target.value)} /></FormRow>
              <FormSection title="Address">
                <FormRow label="Town"><input value={town} onChange={(event) => setTown(event.target.value)} /></FormRow>
              </FormSection>
            </>
          )}
        </FormGrid>
      </div>
    </CatalogStory>
  );
}

function PageToolbarStory() {
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("All");
  const [showAction, setShowAction] = useState(true);

  return (
    <CatalogStory
      title="PageToolbar"
      description="Responsive composition primitives for page search, filters, tag filters and trailing actions."
      moduleName="PageToolbar"
      code={`<PageToolbar>
  <ToolbarStart>
    <Input placeholder="Search..." />
    <TagFilters tags={["All", "Active", "Paused"]} selectedTag="${selectedTag}" ... />
  </ToolbarStart>
  <ToolbarEnd>${showAction ? "<Button>Add customer</Button>" : ""}</ToolbarEnd>
</PageToolbar>`}
      controls={
        <>
          <TextControl label="search value" value={query} onChange={setQuery} />
          <SelectControl label="selected tag" value={selectedTag} options={["All", "Active", "Paused"]} onChange={setSelectedTag} />
          <BooleanControl label="show action" checked={showAction} onChange={setShowAction} />
        </>
      }
    >
      <div className={styles.demoToolbarConstraint}>
        <PageToolbar>
          <ToolbarStart>
            <div className={styles.demoToolbarSearch}>
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search customers..."
                leftIcon={<Search />}
                fullWidth
              />
            </div>
            <TagFilters
              tags={["All", "Active", "Paused"]}
              selectedTag={selectedTag}
              onTagSelect={setSelectedTag}
            />
          </ToolbarStart>
          <ToolbarEnd>
            {showAction ? <Button leftIcon={<Plus />}>Add customer</Button> : null}
          </ToolbarEnd>
        </PageToolbar>
      </div>
    </CatalogStory>
  );
}

function FiltersCardLayoutStory() {
  const [expanded, setExpanded] = useState(true);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("all");

  return (
    <CatalogStory
      title="FiltersCardLayout"
      description="Minimal Card-backed shell for feature-owned top rows and animated expanded filter content."
      moduleName="FiltersCardLayout"
      code={`<FiltersCardLayout
  isExpanded={${expanded}}
  topRow={...}
  expandedContent={...}
  expandedWrapClassName={styles.filtersWrap}
  expandedOpenClassName={styles.filtersOpen}
  expandedInnerClassName={styles.filtersInner}
/>`}
      controls={
        <>
          <BooleanControl label="isExpanded" checked={expanded} onChange={setExpanded} />
          <TextControl label="search" value={query} onChange={setQuery} />
          <SelectControl label="status" value={status} options={[{label:"All",value:"all"},{label:"Active",value:"active"},{label:"Paused",value:"paused"}]} onChange={setStatus} />
          <SelectControl label="category" value={category} options={[{label:"All",value:"all"},{label:"Retail",value:"retail"},{label:"Wholesale",value:"wholesale"}]} onChange={setCategory} />
        </>
      }
    >
      <div className={styles.demoFiltersConstraint}>
        <FiltersCardLayout
          className={styles.demoFiltersCard}
          isExpanded={expanded}
          topRow={
            <div className={styles.demoFilterTop}>
              <div className={styles.demoFilterSearch}>
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search..."
                  leftIcon={<Search />}
                  fullWidth
                />
              </div>
              <Button variant="outline" onClick={() => setExpanded((current) => !current)}>
                {expanded ? "Hide filters" : "Show filters"}
              </Button>
            </div>
          }
          expandedContent={
            <div className={styles.demoFilterFields}>
              <Select label="Status" value={status} onChange={setStatus} options={[{value:"all",label:"All"},{value:"active",label:"Active"},{value:"paused",label:"Paused"}]} />
              <Select label="Category" value={category} onChange={setCategory} options={[{value:"all",label:"All"},{value:"retail",label:"Retail"},{value:"wholesale",label:"Wholesale"}]} />
            </div>
          }
          expandedWrapClassName={styles.demoFilterWrap}
          expandedOpenClassName={styles.demoFilterOpen}
          expandedInnerClassName={styles.demoFilterInner}
        />
      </div>
    </CatalogStory>
  );
}

export const catalogEntries: CatalogEntry[] = [
  {
    id: "button",
    title: "Button",
    category: "Actions",
    description: "Variants, sizes, loading, icons and native button behavior.",
    moduleName: "Button",
    keywords: ["action", "cta", "submit", "danger", "loading"],
    component: ButtonStory,
  },
  {
    id: "input",
    title: "Input",
    category: "Forms",
    description: "Labeled input with icons, hints, errors and native attributes.",
    moduleName: "Input",
    keywords: ["form", "field", "text", "validation"],
    component: InputStory,
  },
  {
    id: "select",
    title: "Select",
    category: "Forms",
    description: "Native select wrapper with options, labels and validation.",
    moduleName: "Select",
    keywords: ["dropdown", "form", "field", "options"],
    component: SelectStory,
  },
  {
    id: "create-search",
    title: "CreateSearch",
    category: "Forms",
    description: "Search input with selectable results and async states.",
    moduleName: "CreateSearch",
    keywords: ["autocomplete", "search", "suggestions", "create"],
    component: CreateSearchStory,
  },
  {
    id: "badge",
    title: "Badge",
    category: "Display",
    description: "Semantic compact labels and status indicators.",
    moduleName: "Badge",
    keywords: ["status", "pill", "tag"],
    component: BadgeStory,
  },
  {
    id: "skeleton",
    title: "Skeleton",
    category: "Display",
    description: "Shimmer placeholders for content loading.",
    moduleName: "Skeleton",
    keywords: ["loading", "placeholder", "shimmer"],
    component: SkeletonStory,
  },
  {
    id: "card",
    title: "Card",
    category: "Surfaces",
    description: "Composable surface and its header/content/footer primitives.",
    moduleName: "Card",
    keywords: ["surface", "container", "panel"],
    component: CardStory,
  },
  {
    id: "modal",
    title: "Modal",
    category: "Surfaces",
    description: "Fixed overlay with sizes, body lock, Escape close and footer.",
    moduleName: "Modal",
    keywords: ["dialog", "overlay", "popup"],
    component: ModalStory,
  },
  {
    id: "tabs",
    title: "Tabs",
    category: "Navigation",
    description: "Controlled and uncontrolled tab navigation primitives.",
    moduleName: "Tabs",
    keywords: ["navigation", "tablist", "content"],
    component: TabsStory,
  },
  {
    id: "page-toolbar",
    title: "PageToolbar",
    category: "Navigation",
    description: "Responsive page-level search/filter/action composition.",
    moduleName: "PageToolbar",
    keywords: ["toolbar", "filters", "actions", "tags"],
    component: PageToolbarStory,
  },
  {
    id: "toast",
    title: "Toast",
    category: "Feedback",
    description: "Global transient notifications through ToastProvider.",
    moduleName: "Toast",
    keywords: ["notification", "success", "error", "warning"],
    component: ToastStory,
  },
  {
    id: "loading-screen",
    title: "LoadingScreen",
    category: "Feedback",
    description: "Full-screen blocking loading state.",
    moduleName: "LoadingScreen",
    keywords: ["loading", "spinner", "overlay"],
    component: LoadingScreenStory,
  },
  {
    id: "table",
    title: "Table",
    category: "Data",
    description: "Composable tables with sorting, row states and alignment.",
    moduleName: "Table",
    keywords: ["data", "grid", "sorting", "row"],
    component: TableStory,
  },
  {
    id: "data-table-card",
    title: "DataTableCard",
    category: "Data",
    description: "Table card shell with loading overlay and pagination.",
    moduleName: "DataTableCard",
    keywords: ["data", "pagination", "loading", "table"],
    component: DataTableCardStory,
  },
  {
    id: "form-grid",
    title: "FormGrid",
    category: "Layout",
    description: "Responsive label/control form composition.",
    moduleName: "FormGrid",
    keywords: ["form", "layout", "row", "section"],
    component: FormGridStory,
  },
  {
    id: "filters-card-layout",
    title: "FiltersCardLayout",
    category: "Layout",
    description: "Expandable Card shell for feature-defined filters.",
    moduleName: "FiltersCardLayout",
    keywords: ["filters", "layout", "expand", "card"],
    component: FiltersCardLayoutStory,
  },
];

export const categoryOrder = [
  "Actions",
  "Forms",
  "Display",
  "Surfaces",
  "Navigation",
  "Feedback",
  "Data",
  "Layout",
] as const;
