import React, { useState, useMemo, useRef } from "react";
import {
  Plus,
  Download,
  RefreshCw,
  Upload,
  FileSpreadsheet,
  PackageCheck,
  PackageX,
  Loader2,
  X,
} from "lucide-react";
import { useDeliveryRuns } from "./useDeliveryRuns";
import { DeliveryRunsTable } from "./components";
import {
  Button,
  FiltersCardLayout,
  Input,
  Modal,
  ModalFooter,
  PageContainer,
  Select,
} from "@/components/common";
import { useToast } from "@/components/common/Toast";
import {
  getImportedOrdersCount,
  listEligibleOrders,
} from "@/context/DeliveryRuns";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/context/Auth/AuthContext";
import styles from "./DeliveryRunsPage.module.css";
import sharedFilterStyles from "@/components/common/FiltersCardLayout/SharedFilters.module.css";

const IMPORT_TEMPLATE_ROWS = [
  [
    "name",
    "address",
    "postcode",
    "contact",
    "order",
    "delivery fee",
    "total",
    "Delivery Instructions",
  ],
  [
    "Amina Rahman",
    "24 Market Street, Leeds",
    "LS1 6DT",
    "07123 456789",
    "1x PRODUCT-SKU-1, 2x PRODUCT-SKU-2",
    "3.50",
    "28.50",
    "Leave with reception",
  ],
  [
    "Daniel Jones",
    "8 Park View, Bradford",
    "BD1 3AA",
    "07987 654321",
    "1x PRODUCT-SKU-3",
    "0.00",
    "12.00",
    "Call on arrival",
  ],
];

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;
const IMPORT_FILE_PATTERN = /\.(xlsx?|csv)$/i;

const escapeCsvCell = (value: string) =>
  /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

const downloadImportTemplate = () => {
  const csv = IMPORT_TEMPLATE_ROWS.map((row) =>
    row.map(escapeCsvCell).join(","),
  ).join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "Import-template.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const DeliveryRunsPage: React.FC = () => {
  const { user } = useAuth();
  const { hasPermission } = usePermissions();
  const {
    runs,
    loading,
    error,
    params,
    updateFilters,
    createRun,
    creating,
    refetch,
  } = useDeliveryRuns();
  const { showToast } = useToast();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRunDate, setNewRunDate] = useState("");
  const [eligibleOrders, setEligibleOrders] = useState<Array<any>>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [ordersFile, setOrdersFile] = useState<File | null>(null);
  const [importedOrdersCount, setImportedOrdersCount] = useState(0);
  const [importCountLoading, setImportCountLoading] = useState(false);
  const [isFileDragActive, setIsFileDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const roleName = useMemo(() => {
    const role: any = (user as any)?.role;
    if (!role) return "";
    if (typeof role === "string") return role.toLowerCase();
    if (typeof role === "object" && role?.name)
      return String(role.name).toLowerCase();
    return "";
  }, [user]);

  const isDriver = roleName === "driver";
  const totalOrdersToCreate = selectedOrderIds.length + importedOrdersCount;

  const filterDates = useMemo(() => {
    const today = new Date();
    const nextDeliveryDays: Date[] = [];

    // Find next 2 delivery days (assuming Tue/Fri for example)
    for (let i = 1; i <= 14 && nextDeliveryDays.length < 2; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const day = d.getDay();
      // Assume delivery days are Tuesday (2) and Friday (5)
      if (day === 2 || day === 5) {
        nextDeliveryDays.push(d);
      }
    }

    return {
      next: nextDeliveryDays[0]?.toISOString().split("T")[0],
    };
  }, []);

  const handleStatusFilter = (status: string) => {
    updateFilters({ status: status as any });
  };

  const handleCreateRun = async () => {
    if (!newRunDate) return;
    if (totalOrdersToCreate === 0) {
      showToast({
        type: "error",
        title: "Select orders or upload a file",
      });
      return;
    }

    const result = await createRun(newRunDate, selectedOrderIds, ordersFile);
    if (result.success) {
      showToast({ type: "success", title: "Delivery run created" });
      setShowCreateModal(false);
      setNewRunDate("");
      setEligibleOrders([]);
      setSelectedOrderIds([]);
      setOrdersFile(null);
      setImportedOrdersCount(0);
    } else {
      showToast({
        type: "error",
        title: (result as any).message || "Failed to create run",
      });
    }
  };

  const loadOrdersForDate = async (date: string) => {
    if (!date) return;
    setOrdersLoading(true);
    try {
      const orders = await listEligibleOrders(date);
      setEligibleOrders(orders);
      setSelectedOrderIds(orders.map((o: any) => o.id));
    } catch {
      setEligibleOrders([]);
      setSelectedOrderIds([]);
    } finally {
      setOrdersLoading(false);
    }
  };

  // Default to next Tuesday or Friday for new run
  const getDefaultDate = () => {
    return filterDates.next || new Date().toISOString().split("T")[0];
  };

  const openCreateRun = () => {
    const defaultDate = getDefaultDate();
    setNewRunDate(defaultDate);
    setImportedOrdersCount(0);
    setOrdersFile(null);
    setShowCreateModal(true);
    void loadOrdersForDate(defaultDate);
  };

  const handleOrdersFileChange = async (file: File | null) => {
    if (file && !IMPORT_FILE_PATTERN.test(file.name)) {
      showToast({
        type: "error",
        title: "Choose an XLSX, XLS, or CSV file",
      });
      return;
    }

    if (file && file.size > MAX_IMPORT_FILE_SIZE) {
      showToast({
        type: "error",
        title: "The import file must be smaller than 10 MB",
      });
      return;
    }

    setOrdersFile(file);
    setImportedOrdersCount(0);

    if (!file) return;

    setImportCountLoading(true);
    try {
      const count = await getImportedOrdersCount(file);
      setImportedOrdersCount(count);
    } catch {
      setImportedOrdersCount(0);
      showToast({
        type: "error",
        title: "Could not read the imported orders file",
      });
    } finally {
      setImportCountLoading(false);
    }
  };

  const clearOrdersFile = () => {
    void handleOrdersFileChange(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <PageContainer className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Delivery Runs</h1>
          <p className={styles.subtitle}>
            {runs.length} delivery {runs.length === 1 ? "run" : "runs"} found
          </p>
        </div>
        <Button
          variant="outline"
          leftIcon={<RefreshCw size={16} />}
          onClick={refetch}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>

      <FiltersCardLayout
        className={sharedFilterStyles.filtersCard}
        topRow={
          <div className={styles.filterToolbar}>
            <Select
              className={styles.statusFilter}
              label="Status"
              value={params.status || "all"}
              onChange={(value) => handleStatusFilter(value)}
              options={[
                { value: "all", label: "All Statuses" },
                { value: "draft", label: "Draft" },
                { value: "locked", label: "Locked" },
                { value: "routed", label: "Routed" },
                { value: "dispatched", label: "Dispatched" },
                { value: "completed", label: "Completed" },
              ]}
            />

            {hasPermission("delivery.routes.update") && !isDriver && (
              <Button
                className={styles.createButton}
                variant="primary"
                size="sm"
                leftIcon={<Plus size={16} />}
                onClick={openCreateRun}
              >
                Create Delivery Run
              </Button>
            )}
          </div>
        }
      />

      {error ? <div className={styles.error}>{error}</div> : null}

      <DeliveryRunsTable
        runs={runs}
        loading={loading}
      />

      {/* Create Run Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Delivery Run"
        size="xl"
      >
        <p className={styles.modalDescription}>
          Choose a delivery date and review the orders that will be included.
          You can also import additional one-time orders from a spreadsheet.
        </p>

        <div className={styles.createRunGrid}>
          <section className={styles.modalSection}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionNumber}>1</span>
              <div>
                <h3>Delivery schedule</h3>
                <p>Paid orders for this date are included automatically.</p>
              </div>
            </div>

            <Input
              type="date"
              label="Delivery date"
              fullWidth
              value={newRunDate}
              onChange={(event) => {
                const value = event.target.value;
                setNewRunDate(value);
                void loadOrdersForDate(value);
              }}
              min={new Date().toISOString().split("T")[0]}
            />

            <div
              className={`${styles.availability} ${
                !ordersLoading && selectedOrderIds.length > 0
                  ? styles.availabilityReady
                  : !ordersLoading
                    ? styles.availabilityEmpty
                    : ""
              }`}
              role="status"
              aria-live="polite"
            >
              <div className={styles.availabilityIcon}>
                {ordersLoading ? (
                  <Loader2 className={styles.spinner} size={20} />
                ) : selectedOrderIds.length > 0 ? (
                  <PackageCheck size={20} />
                ) : (
                  <PackageX size={20} />
                )}
              </div>
              <div>
                <strong>
                  {ordersLoading
                    ? "Checking available orders"
                    : `${selectedOrderIds.length} eligible ${selectedOrderIds.length === 1 ? "order" : "orders"}`}
                </strong>
                <p>
                  {ordersLoading
                    ? "Please wait while orders are matched to this date."
                    : selectedOrderIds.length > 0
                      ? "These paid orders will be added to the delivery run."
                      : "No eligible paid orders were found for this date."}
                </p>
              </div>
            </div>
          </section>

          <section className={styles.modalSection}>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionNumber}>2</span>
              <div>
                <h3>Import additional orders</h3>
                <p>Optional · XLSX, XLS, or CSV</p>
              </div>
            </div>

          <input
            ref={fileInputRef}
            id="delivery-run-orders-file"
            type="file"
            className={styles.fileInput}
            accept=".xlsx,.xls,.csv"
            onChange={(event) =>
              void handleOrdersFileChange(event.target.files?.[0] || null)
            }
          />

            {ordersFile ? (
              <div className={styles.selectedFile}>
                <FileSpreadsheet size={24} aria-hidden="true" />
                <div className={styles.selectedFileDetails}>
                  <strong>{ordersFile.name}</strong>
                  <span>
                    {importCountLoading
                      ? "Reading imported orders…"
                      : `${importedOrdersCount} ${importedOrdersCount === 1 ? "order" : "orders"} detected`}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Remove selected orders file"
                  onClick={clearOrdersFile}
                  disabled={importCountLoading}
                >
                  <X size={16} />
                </Button>
              </div>
            ) : (
              <div
                className={`${styles.uploadArea} ${isFileDragActive ? styles.uploadAreaDragActive : ""}`}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setIsFileDragActive(true);
                }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                    setIsFileDragActive(false);
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsFileDragActive(false);
                  void handleOrdersFileChange(event.dataTransfer.files?.[0] || null);
                }}
              >
                <div className={styles.uploadIcon}>
                  <Upload size={24} aria-hidden="true" />
                </div>
                <div>
                  <strong>Drop a spreadsheet here</strong>
                  <p>or choose a file from your device · maximum 10 MB</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<Upload size={16} />}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Choose file
                </Button>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              leftIcon={<Download size={16} />}
              onClick={downloadImportTemplate}
              className={styles.templateButton}
            >
              Download CSV template
            </Button>

            <p className={styles.importHint}>
              Required columns: name, address, postcode, contact, order,
              delivery fee, and total. Use product SKUs in the order column.
            </p>
          </section>
        </div>

        <div
          className={`${styles.runSummary} ${totalOrdersToCreate > 0 ? styles.runSummaryReady : ""}`}
          aria-live="polite"
        >
          <div className={styles.summaryIcon}>
            <PackageCheck size={22} aria-hidden="true" />
          </div>
          <div className={styles.summaryContent}>
            <strong>Run summary</strong>
            <p>
              {selectedOrderIds.length} existing + {importedOrdersCount} imported
              {newRunDate ? ` for ${new Date(`${newRunDate}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : ""}
            </p>
          </div>
          <div className={styles.summaryTotal}>
            <strong>{ordersLoading || importCountLoading ? "—" : totalOrdersToCreate}</strong>
            <span>Total orders</span>
          </div>
        </div>

        <ModalFooter>
          <span className={styles.footerHint} aria-live="polite">
            {ordersLoading || importCountLoading
              ? "Finishing order checks…"
              : totalOrdersToCreate > 0
                ? `Ready to create with ${totalOrdersToCreate} ${totalOrdersToCreate === 1 ? "order" : "orders"}.`
                : "Add at least one order to continue."}
          </span>
          <Button variant="outline" onClick={() => setShowCreateModal(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            isLoading={creating}
            onClick={handleCreateRun}
            disabled={
              !newRunDate ||
              importCountLoading ||
              ordersLoading ||
              creating ||
              totalOrdersToCreate === 0
            }
          >
            {`Create run${totalOrdersToCreate > 0 ? ` (${totalOrdersToCreate})` : ""}`}
          </Button>
        </ModalFooter>
      </Modal>
    </PageContainer>
  );
};

export default DeliveryRunsPage;
