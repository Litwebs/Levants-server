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

export function TableStory() {
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

export function DataTableCardStory() {
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(47);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <CatalogStory
      title="DataTableCard"
      description="Production table shell combining Card, column-aligned skeleton rows and controlled pagination."
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
