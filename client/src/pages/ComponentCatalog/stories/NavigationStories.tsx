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

export function TabsStory() {
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

export function PageToolbarStory() {
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
