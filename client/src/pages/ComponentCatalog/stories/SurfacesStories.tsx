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

export function CardStory() {
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

export function ModalStory() {
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
