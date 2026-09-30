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

export function FormGridStory() {
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

export function FiltersCardLayoutStory() {
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
  expandedWrapClassName={sharedFilters.filtersRowWrap}
  expandedOpenClassName={sharedFilters.filtersRowOpen}
  expandedInnerClassName={sharedFilters.filtersRowInner}
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
