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

export function ButtonStory() {
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
