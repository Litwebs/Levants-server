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

export function BadgeStory() {
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

export function SkeletonStory() {
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
