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
} from "lucide-react";
import {
  BooleanControl,
  CatalogStory,
  ControlGroup,
  NumberControl,
  SelectControl,
  TextControl,
} from "../CatalogUI";
import styles from "../ComponentCatalog.module.css";

export function InputStory() {
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

export function SelectStory() {
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

export function CreateSearchStory() {
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
