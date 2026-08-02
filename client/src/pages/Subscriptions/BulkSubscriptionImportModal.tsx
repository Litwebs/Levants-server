import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
} from "lucide-react";
import {
  Badge,
  Button,
  Modal,
  ModalFooter,
  Table,
  TableCell,
  TableHead,
  TableRow,
} from "../../components/common";
import { useToast } from "../../components/common/Toast";
import api from "../../context/api";
import styles from "./Subscriptions.module.css";
import {
  escapeCsvCell,
  parseSubscriptionCsv,
  type ImportVariant,
  type ParsedImportRow,
} from "./subscriptionCsvImport";

type ProductOption = {
  name: string;
  status: string;
  isSubscriptionEligible?: boolean;
  variants?: Array<{
    _id: string;
    sku?: string;
    name: string;
    status: string;
  }>;
};

type ImportResult = {
  rowNumber: number;
  email: string;
  customerName: string;
  status: "created" | "failed";
  message: string;
  onboardingLink?: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
};

type ApiError = {
  message?: string;
  response?: { data?: { message?: string } };
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (!error || typeof error !== "object") return fallback;
  const apiError = error as ApiError;
  return apiError.response?.data?.message || apiError.message || fallback;
};

const TEMPLATE_HEADERS = [
  "First Name",
  "Last Name",
  "Email",
  "Phone",
  "Address Line 1",
  "Address Line 2",
  "City",
  "Postcode",
  "Country",
  "Delivery Instructions",
  "Frequency",
  "Delivery Days",
  "Items",
];

const saveCsv = (fileName: string, rows: unknown[][]) => {
  const content = rows.map((row) => row.map(escapeCsvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export default function BulkSubscriptionImportModal({
  isOpen,
  onClose,
  onImported,
}: Props) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [variants, setVariants] = useState<ImportVariant[]>([]);
  const [deliveryDays, setDeliveryDays] = useState<number[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedImportRow[]>([]);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoadingOptions(true);
    void Promise.all([
      api.get("/admin/products", { params: { page: 1, pageSize: 100 } }),
      api.get("/admin/subscription-settings"),
    ])
      .then(([productsResponse, settingsResponse]) => {
        const products: ProductOption[] = productsResponse.data?.data?.products || [];
        setVariants(
          products
            .filter(
              (product) =>
                product.status === "active" &&
                product.isSubscriptionEligible !== false,
            )
            .flatMap((product) =>
              (product.variants || [])
                .filter((variant) => variant.status === "active" && variant.sku)
                .map((variant) => ({
                  _id: variant._id,
                  sku: variant.sku,
                  name: variant.name,
                  productName: product.name,
                })),
            ),
        );
        const days =
          settingsResponse.data?.data?.settings?.deliveryDays ||
          settingsResponse.data?.data?.deliveryDays ||
          [0, 3];
        setDeliveryDays(Array.isArray(days) ? days : [0, 3]);
      })
      .catch(() => {
        showToast({
          type: "error",
          title: "Could not load import options",
          message: "Refresh the page and try again.",
        });
      })
      .finally(() => setLoadingOptions(false));
  }, [isOpen, showToast]);

  const invalidRows = useMemo(
    () => rows.filter((row) => row.errors.length > 0),
    [rows],
  );
  const createdCount = results.filter((result) => result.status === "created").length;
  const failedCount = results.length - createdCount;

  const reset = () => {
    setFileName("");
    setRows([]);
    setResults([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const close = () => {
    if (importing) return;
    reset();
    onClose();
  };

  const readFile = async (file?: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      showToast({ type: "error", title: "Choose a CSV file" });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      showToast({ type: "error", title: "The CSV must be smaller than 2 MB" });
      return;
    }
    if (loadingOptions || !variants.length || !deliveryDays.length) {
      showToast({
        type: "error",
        title: "Product options are still loading",
        message: "Wait a moment, then choose the file again.",
      });
      return;
    }
    try {
      const parsed = parseSubscriptionCsv(await file.text(), variants, deliveryDays);
      setFileName(file.name);
      setRows(parsed);
      setResults([]);
    } catch (error: unknown) {
      showToast({
        type: "error",
        title: "Could not read this CSV",
        message: getErrorMessage(error, "Check the file and try again."),
      });
    }
  };

  const downloadTemplate = () => {
    saveCsv("subscription-import-template.csv", [
      TEMPLATE_HEADERS,
      [
        "Rebecca",
        "Davey",
        "customer@example.com",
        "07400123456",
        "21 Andover Green",
        "",
        "Bradford",
        "BD4 9HG",
        "United Kingdom",
        "Leave by the back door",
        "weekly",
        "Sunday|Wednesday",
        variants[0]?.sku ? `${variants[0].sku}:1` : "PRODUCT-SKU:1",
      ],
    ]);
  };

  const downloadSkuReference = () => {
    saveCsv("subscription-product-skus.csv", [
      ["SKU", "Product", "Variant"],
      ...variants.map((variant) => [variant.sku, variant.productName, variant.name]),
    ]);
  };

  const submitImport = async () => {
    if (!rows.length || invalidRows.length) return;
    setImporting(true);
    try {
      const response = await api.post("/admin/subscriptions/bulk-setup-links", {
        rows: rows.map((row) => row.payload),
      });
      const importedResults: ImportResult[] = response.data?.data?.results || [];
      setResults(importedResults);
      onImported();
      const summary = response.data?.data?.summary;
      showToast({
        type: summary?.failed ? "warning" : "success",
        title: summary?.failed
          ? "Import completed with row errors"
          : "Subscription setups imported",
        message: `${summary?.created || 0} created · ${summary?.failed || 0} failed`,
      });
    } catch (error: unknown) {
      showToast({
        type: "error",
        title: "Import failed",
        message: getErrorMessage(error, "Please try again."),
      });
    } finally {
      setImporting(false);
    }
  };

  const downloadResults = () => {
    saveCsv("subscription-import-results.csv", [
      ["CSV Row", "Customer", "Email", "Result", "Message", "Onboarding Link"],
      ...results.map((result) => [
        result.rowNumber,
        result.customerName,
        result.email,
        result.status,
        result.message,
        result.onboardingLink || "",
      ]),
    ]);
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title="Import subscription customers" size="xl">
      {results.length ? (
        <div className={styles.importBody}>
          <div className={styles.importResultSummary}>
            <CheckCircle2 size={22} aria-hidden="true" />
            <div>
              <h3>Import complete</h3>
              <p>
                {createdCount} pending setups created · {failedCount} failed. Download
                the results for backup onboarding links if an email does not arrive.
              </p>
            </div>
          </div>
          <div className={styles.importTableWrap}>
            <Table withWrapper={false} tableClassName={styles.importResultsTable}>
              <caption className="sr-only">Subscription import results</caption>
              <colgroup>
                <col className={styles.importRowColumn} />
                <col className={styles.importCustomerColumn} />
                <col className={styles.importStatusColumn} />
                <col />
              </colgroup>
              <thead>
                <TableRow>
                  <TableHead>CSV row</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </thead>
              <tbody>
                {results.map((result) => (
                  <TableRow key={`${result.rowNumber}-${result.email}`}>
                    <TableCell className={styles.importRowNumber}>
                      {result.rowNumber}
                    </TableCell>
                    <TableCell>
                      <strong>{result.customerName}</strong>
                      <span className={styles.importCellSecondary}>{result.email}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={result.status === "created" ? "success" : "error"}>
                        {result.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{result.message}</TableCell>
                  </TableRow>
                ))}
              </tbody>
            </Table>
          </div>
        </div>
      ) : (
        <div className={styles.importBody}>
          <div className={styles.importNotice}>
            <AlertCircle size={18} aria-hidden="true" />
            <div>
              <strong>This creates pending setups, not live billing</strong>
              <span>
                Each customer must use their onboarding link to verify their account and
                add a payment method before the subscription becomes active.
              </span>
            </div>
          </div>

          <div className={styles.importTools}>
            <div>
              <h3>1. Prepare your CSV</h3>
              <p>
                Add frequency, delivery days and product SKUs. Separate two weekly
                delivery days with <code>|</code>, and enter items as <code>SKU:quantity</code>.
              </p>
            </div>
            <div className={styles.importToolActions}>
              <Button variant="outline" size="sm" onClick={downloadTemplate} leftIcon={<Download size={16} />}>
                Download template
              </Button>
              <Button variant="ghost" size="sm" onClick={downloadSkuReference} disabled={!variants.length} leftIcon={<Download size={16} />}>
                SKU reference
              </Button>
            </div>
          </div>

          <div>
            <h3 className={styles.importSectionTitle}>2. Upload and review</h3>
            <label
              className={`${styles.importDropzone} ${loadingOptions ? styles.importDropzoneDisabled : ""}`}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                void readFile(event.dataTransfer.files?.[0]);
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                disabled={loadingOptions}
                onChange={(event) => void readFile(event.target.files?.[0])}
              />
              <FileSpreadsheet size={28} aria-hidden="true" />
              <strong>{fileName || (loadingOptions ? "Loading products…" : "Choose a CSV or drop it here")}</strong>
              <span>Up to 250 customers · maximum 2 MB</span>
            </label>
          </div>

          {rows.length > 0 && (
            <>
              <div className={styles.importReviewHeader} aria-live="polite">
                <div>
                  <h3>Review {rows.length} customers</h3>
                  <p>
                    {invalidRows.length
                      ? `Fix ${invalidRows.length} invalid row${invalidRows.length === 1 ? "" : "s"} in the CSV, then upload it again.`
                      : "All rows are ready to import."}
                  </p>
                </div>
                <Badge variant={invalidRows.length ? "error" : "success"}>
                  {invalidRows.length ? `${invalidRows.length} need attention` : "Ready"}
                </Badge>
              </div>
              <div className={styles.importTableWrap}>
                <Table withWrapper={false} tableClassName={styles.importPreviewTable}>
                  <caption className="sr-only">Customers ready for subscription import</caption>
                  <colgroup>
                    <col className={styles.importRowColumn} />
                    <col className={styles.importCustomerColumn} />
                    <col className={styles.importScheduleColumn} />
                    <col className={styles.importItemsColumn} />
                    <col className={styles.importValidationColumn} />
                  </colgroup>
                  <thead>
                    <TableRow>
                      <TableHead>CSV row</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Schedule</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Validation</TableHead>
                    </TableRow>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <TableRow
                        key={`${row.rowNumber}-${row.email}`}
                        className={row.errors.length ? styles.importInvalidRow : ""}
                      >
                        <TableCell className={styles.importRowNumber}>
                          {row.rowNumber}
                        </TableCell>
                        <TableCell>
                          <strong>{row.name}</strong>
                          <span className={styles.importCellSecondary}>{row.email || "No email"}</span>
                        </TableCell>
                        <TableCell className={styles.importScheduleCell}>
                          {row.schedule}
                        </TableCell>
                        <TableCell className={styles.importItemsCell}>
                          {row.itemSummary}
                        </TableCell>
                        <TableCell>
                          {row.errors.length ? (
                            <ul className={styles.importErrors}>
                              {row.errors.map((error) => <li key={error}>{error}</li>)}
                            </ul>
                          ) : (
                            <span className={styles.importValid}>Ready</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </tbody>
                </Table>
              </div>
            </>
          )}
        </div>
      )}

      <ModalFooter>
        {results.length ? (
          <>
            <Button variant="outline" onClick={downloadResults} leftIcon={<Download size={16} />}>
              Download results
            </Button>
            <Button onClick={close}>Done</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" onClick={close} disabled={importing}>Cancel</Button>
            <Button
              onClick={submitImport}
              isLoading={importing}
              disabled={!rows.length || invalidRows.length > 0 || loadingOptions}
              leftIcon={<Upload size={16} />}
            >
              Import {rows.length || ""} customers
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
