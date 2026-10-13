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

export function ToastStory() {
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

export function LoadingScreenStory() {
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
