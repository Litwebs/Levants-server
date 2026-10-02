import {
  Button,
  Card,
  Input,
  Modal,
  ModalFooter,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/common";
import {
  AlertTriangle,
  CalendarDays,
  Upload,
  ChevronDown,
  ChevronUp,
  Trash2,
} from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import styles from "./Orders.module.css";
import { useEffect, useMemo, useRef, useState } from "react";
import type { OrdersStockRequirements } from "../../context/Orders";
import type { Order } from "./useOrders";

const DELIVERY_STATUSES = [
  "ordered",
  "dispatched",
  "in_transit",
  "delivered",
  "returned",
] as const;

const ACCEPTED_ORDER_FILE_EXTENSIONS = [".csv", ".xlsx", ".xls"];

const getTodayInputValue = () => {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

interface Props {
  selectedOrders: string[];
  filteredOrders: Order[];
  bulkDeleteOrders: (
    orderIds: string[],
  ) => Promise<{ matched: number; deleted: number } | null>;
  bulkUpdateStatus: (status: string) => void | Promise<void>;
  bulkAssignDeliveryDate: (dateInput: string) => void | Promise<void>;
  getOrdersStockRequirements: (params?: {
    orderIds?: string[];
    ordersFile?: File;
    orderTypeScope?: "both" | "normal" | "subscription";
    deliveryDate?: string;
  }) => Promise<OrdersStockRequirements | null>;
  setSelectedOrders: (ids: string[]) => void;
}

type StockSource = "delivery_date" | "selected_orders" | "file";

const OrdersBulkActions = ({
  selectedOrders,
  filteredOrders,
  bulkDeleteOrders,
  bulkUpdateStatus,
  bulkAssignDeliveryDate,
  getOrdersStockRequirements,
  setSelectedOrders,
}: Props) => {
  const { hasPermission } = usePermissions();
  const canUpdateOrders = hasPermission("orders.update");
  const canDeleteOrders = hasPermission("orders.delete");
  const canReadDelivery = hasPermission("delivery.routes.read");

  const today = useMemo(getTodayInputValue, []);

  const [deliveryDate, setDeliveryDate] = useState(today);
  const [isAssigning, setIsAssigning] = useState(false);
  const [deliveryStatus, setDeliveryStatus] = useState("");
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [ordersFile, setOrdersFile] = useState<File | null>(null);
  const [ordersFileError, setOrdersFileError] = useState("");
  const [isCalculatingStock, setIsCalculatingStock] = useState(false);
  const [stockSource, setStockSource] = useState<StockSource>("delivery_date");
  const [stockDeliveryDate, setStockDeliveryDate] = useState(today);
  const [stockOrderTypeScope, setStockOrderTypeScope] = useState<
    "both" | "normal" | "subscription"
  >("both");
  const [stockResult, setStockResult] =
    useState<OrdersStockRequirements | null>(null);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const selectedOrderIds = useMemo(() => new Set(selectedOrders), [selectedOrders]);
  const furthestSelectedStatus = useMemo(() => {
    const indexes = filteredOrders
      .filter((order) => selectedOrderIds.has(order.id))
      .map((order) =>
        DELIVERY_STATUSES.indexOf(
          order.deliveryStatus as (typeof DELIVERY_STATUSES)[number],
        ),
      );
    return indexes.length ? Math.max(...indexes) : -1;
  }, [filteredOrders, selectedOrderIds]);

  useEffect(() => {
    if (selectedOrders.length === 0 && stockSource === "selected_orders") {
      setStockSource("delivery_date");
    }
  }, [selectedOrders.length, stockSource]);

  if (!canUpdateOrders && !canReadDelivery && !canDeleteOrders) return null;
  if (!selectedOrders.length && !canReadDelivery) return null;

  const hasSelectedOrders = selectedOrders.length > 0;
  const canCalculateStock =
    (stockSource === "delivery_date" && Boolean(stockDeliveryDate)) ||
    (stockSource === "selected_orders" && hasSelectedOrders) ||
    (stockSource === "file" && Boolean(ordersFile));

  return (
    <>
      <Card className={styles.bulkActions}>
        <div className={styles.bulkContent}>
          <span className={styles.bulkCount}>
            {hasSelectedOrders
              ? `${selectedOrders.length} ${selectedOrders.length === 1 ? "order" : "orders"} selected`
              : "Stock planning"}
          </span>

          <div className={styles.bulkButtons}>
            {(hasSelectedOrders && canUpdateOrders) || canReadDelivery ? (
              <Button
                variant="outline"
                size="sm"
                aria-expanded={isExpanded}
                aria-controls="orders-bulk-actions-panel"
                onClick={() => setIsExpanded((expanded) => !expanded)}
              >
                {isExpanded ? "Hide tools" : "Show tools"}
                {isExpanded ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </Button>
            ) : null}
            <div
              className={`${styles.selectionActions} ${
                hasSelectedOrders ? styles.selectionActionsVisible : ""
              }`}
              aria-hidden={!hasSelectedOrders}
            >
              {canDeleteOrders ? (
                <Button
                  variant="ghost"
                  className={styles.bulkDeleteButton}
                  size="sm"
                  disabled={!hasSelectedOrders}
                  tabIndex={hasSelectedOrders ? 0 : -1}
                  onClick={() => setIsDeleteConfirmOpen(true)}
                >
                  <Trash2 size={16} />
                  Delete
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="sm"
                disabled={!hasSelectedOrders}
                tabIndex={hasSelectedOrders ? 0 : -1}
                onClick={() => setSelectedOrders([])}
              >
                Clear Selection
              </Button>
            </div>
          </div>
        </div>

        <div
          id="orders-bulk-actions-panel"
          className={`${styles.bulkSections} ${
            !isExpanded ? styles.bulkSectionsCollapsed : ""
          }`}
          aria-hidden={!isExpanded}
        >
          <div className={styles.bulkSectionsInner}>
            {canUpdateOrders && (
              <div
                className={`${styles.selectionTools} ${
                  hasSelectedOrders ? styles.selectionToolsVisible : ""
                }`}
                aria-hidden={!hasSelectedOrders}
              >
                <div className={styles.selectionToolsInner}>
                  <div
                    className={`${styles.bulkSection} ${styles.updateDeliverySection}`}
                  >
                    <h3 className={styles.bulkSectionTitle}>
                      <CalendarDays size={20} aria-hidden="true" /> Update
                      delivery
                    </h3>

                    <div className={styles.bulkSectionRow}>
                <div className={styles.filterGroup}>
                  <label
                    htmlFor="bulk-delivery-date"
                    className={styles.filterLabel}
                  >
                    Delivery date
                  </label>
                  <Input
                    id="bulk-delivery-date"
                    type="date"
                    className={styles.filterGroup}
                    fullWidth
                    min={today}
                    disabled={!hasSelectedOrders}
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  isLoading={isAssigning}
                  disabled={!hasSelectedOrders || !deliveryDate}
                  onClick={async () => {
                    if (!deliveryDate) return;
                    setIsAssigning(true);
                    try {
                      await bulkAssignDeliveryDate(deliveryDate);
                    } finally {
                      setIsAssigning(false);
                    }
                  }}
                >
                  Set delivery date
                </Button>
                    </div>

                    <div className={styles.bulkSectionRow}>
                <Select
                  id="bulk-delivery-status"
                  className={styles.filterGroup}
                  label="Delivery status"
                  placeholder="Choose a status…"
                  fullWidth
                  disabled={!hasSelectedOrders}
                  value={deliveryStatus}
                  onChange={setDeliveryStatus}
                  options={DELIVERY_STATUSES.map((status, index) => ({
                    value: status,
                    label: `${status
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (character) =>
                        character.toUpperCase(),
                      )}${index <= furthestSelectedStatus ? " (unavailable)" : ""}`,
                    disabled: index <= furthestSelectedStatus,
                  }))}
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!hasSelectedOrders || !deliveryStatus}
                  isLoading={isUpdatingStatus}
                  onClick={async () => {
                    if (!deliveryStatus || isUpdatingStatus) return;
                    setIsUpdatingStatus(true);
                    try {
                      await bulkUpdateStatus(deliveryStatus);
                    } finally {
                      setIsUpdatingStatus(false);
                    }
                  }}
                >
                  Update status
                </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {canReadDelivery && (
            <div className={`${styles.bulkSection} ${styles.stockSection}`}>
              <input
                ref={fileInputRef}
                type="file"
                className={styles.bulkFileInput}
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  const lowerName = file?.name.toLowerCase() || "";
                  const isAccepted =
                    !file || ACCEPTED_ORDER_FILE_EXTENSIONS.some((extension) => lowerName.endsWith(extension));
                  setOrdersFile(isAccepted ? file : null);
                  setOrdersFileError(isAccepted ? "" : "Choose a CSV, XLS, or XLSX file.");
                  if (!isAccepted) e.target.value = "";
                }}
              />

              <div className={styles.bulkSectionRow}>
                <Select
                  id="stock-source"
                  className={styles.filterGroup}
                  label="Count orders from"
                  fullWidth
                  value={stockSource}
                  onChange={(value) => setStockSource(value as StockSource)}
                  options={[
                    { value: "delivery_date", label: "Delivery date" },
                    {
                      value: "selected_orders",
                      label: `Selected orders (${selectedOrders.length})`,
                      disabled: !hasSelectedOrders,
                    },
                    { value: "file", label: "Uploaded file only" },
                  ]}
                />

                {stockSource === "delivery_date" ? (
                  <Input
                    id="stock-delivery-date"
                    className={styles.filterGroup}
                    label="Delivery date"
                    type="date"
                    fullWidth
                    value={stockDeliveryDate}
                    onChange={(event) =>
                      setStockDeliveryDate(event.target.value)
                    }
                  />
                ) : null}

                {stockSource !== "file" ? (
                  <Select
                    id="stock-order-type"
                    className={styles.filterGroup}
                    label="Include"
                    fullWidth
                    value={stockOrderTypeScope}
                    onChange={(value) =>
                      setStockOrderTypeScope(
                        value as "both" | "normal" | "subscription",
                      )
                    }
                    options={[
                      { value: "both", label: "All orders" },
                      { value: "normal", label: "One-time orders" },
                      { value: "subscription", label: "Subscriptions" },
                    ]}
                  />
                ) : null}
              </div>

              <div className={styles.stockScopeNote} role="status">
                {stockSource === "delivery_date"
                  ? "Counts this delivery date, not the table selection."
                  : stockSource === "selected_orders"
                    ? `Counts ${selectedOrders.length} selected orders, filtered by type.`
                    : "Counts all order rows in your uploaded sheet."}
              </div>
              <div className={styles.stockActions}>
                <div className={styles.bulkUploadRow}>
                <>
                  <Button
                    variant="outline"
                    size="md"
                    leftIcon={<Upload size={16} aria-hidden="true" />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {ordersFile
                      ? "Change file"
                      : stockSource === "file"
                        ? "Choose file"
                        : "Add sheet (optional)"}
                  </Button>

                  {ordersFile ? (
                    <>
                      <span
                        className={styles.bulkFileName}
                        title={ordersFile.name}
                      >
                        {ordersFile.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setOrdersFile(null);
                          setOrdersFileError("");
                          if (fileInputRef.current)
                            fileInputRef.current.value = "";
                        }}
                      >
                        Clear file
                      </Button>
                    </>
                  ) : null}
                </>
                </div>
                <div className={styles.stockCalculateRow}>
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={isCalculatingStock}
                  disabled={!canCalculateStock}
                  onClick={async () => {
                    if (isCalculatingStock || !canCalculateStock) return;
                    setIsCalculatingStock(true);
                    try {
                      const data = await getOrdersStockRequirements({
                        orderIds:
                          stockSource === "selected_orders"
                            ? selectedOrders
                            : undefined,
                        ordersFile: ordersFile || undefined,
                        orderTypeScope: stockOrderTypeScope,
                        deliveryDate:
                          stockSource === "delivery_date"
                            ? stockDeliveryDate
                            : undefined,
                      });
                      setStockResult(data);
                      if (data) setIsStockModalOpen(true);
                    } finally {
                      setIsCalculatingStock(false);
                    }
                  }}
                >
                  Calculate stock needed
                </Button>
                </div>
              </div>
              {ordersFile && stockSource !== "file" && (
                <p className={styles.bulkSectionHelp}>
                  All sheet rows are added. Only upload orders not already
                  counted.
                </p>
              )}
              {ordersFileError ? (
                <p className={styles.bulkSectionError} role="alert">
                  {ordersFileError}
                </p>
              ) : null}
            </div>
          )}
          </div>
        </div>
      </Card>

      {canReadDelivery && stockResult && (
        <Modal
          isOpen={isStockModalOpen}
          onClose={() => setIsStockModalOpen(false)}
          title="Stock Needed"
          size="lg"
        >
          {stockResult.sources?.deliveryDate ? (
            <p className={styles.stockResultSummary}>
              Requirements for {stockResult.sources.deliveryDate}:{" "}
              {stockResult.sources.ordersFound || 0} order records and{" "}
              {stockResult.sources.scheduledSubscriptionDeliveriesFound || 0}{" "}
              scheduled subscription deliveries.
            </p>
          ) : null}
          {stockResult.sources?.sheet ? (
            <p className={styles.stockResultSummary}>
              Includes {stockResult.sources.sheet.usableRows || 0} sheet rows
              from{" "}
              {stockResult.sources.sheet.originalName || "the uploaded file"}.
            </p>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead width={140}>SKU</TableHead>
                <TableHead>Name</TableHead>
                <TableHead width={120} align="right">
                  Quantity
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stockResult.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className={styles.emptyTableCell}>
                    No stock is needed for this selection.
                  </TableCell>
                </TableRow>
              ) : (
                stockResult.items.map((it) => (
                  <TableRow key={it.variantId}>
                    <TableCell>{it.sku || "-"}</TableCell>
                    <TableCell>{it.name || "-"}</TableCell>
                    <TableCell align="right">{it.totalQuantity}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <ModalFooter>
            <Button variant="ghost" onClick={() => setIsStockModalOpen(false)}>
              Close
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {canDeleteOrders ? (
        <Modal
          isOpen={isDeleteConfirmOpen}
          onClose={() => {
            if (!isDeleting) setIsDeleteConfirmOpen(false);
          }}
          title="Delete Selected Orders"
          size="sm"
        >
          <div className={styles.deleteConfirmContent}>
            <div className={styles.deleteConfirmIcon}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <p className={styles.deleteConfirmTitle}>
                Delete {selectedOrders.length} selected orders?
              </p>
              <p className={styles.deleteConfirmText}>
                This will permanently delete the selected orders. This cannot be
                undone.
              </p>
            </div>
          </div>

          <ModalFooter>
            <Button
              variant="outline"
              disabled={isDeleting}
              onClick={() => setIsDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={isDeleting}
              disabled={isDeleting || selectedOrders.length === 0}
              onClick={async () => {
                setIsDeleting(true);
                try {
                  const result = await bulkDeleteOrders(selectedOrders);
                  if (result?.deleted) {
                    setIsDeleteConfirmOpen(false);
                  }
                } finally {
                  setIsDeleting(false);
                }
              }}
            >
              <Trash2 size={16} />
              Delete Selected
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </>
  );
};

export default OrdersBulkActions;
