import {
  Button,
  Card,
  Modal,
  ModalFooter,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/common";
import { AlertTriangle, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import styles from "./Orders.module.css";
import { useEffect, useRef, useState } from "react";
import type { OrdersStockRequirements } from "../../context/Orders";

interface Props {
  selectedOrders: string[];
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

  const today = (() => {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();

  const [deliveryDate, setDeliveryDate] = useState(today);
  const [isAssigning, setIsAssigning] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [ordersFile, setOrdersFile] = useState<File | null>(null);
  const [isCalculatingStock, setIsCalculatingStock] = useState(false);
  const [stockSource, setStockSource] =
    useState<StockSource>("delivery_date");
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
                {hasSelectedOrders ? "Bulk actions" : "Stock needed"}
                {isExpanded ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
              </Button>
            ) : null}
            {hasSelectedOrders && canDeleteOrders ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setIsDeleteConfirmOpen(true)}
              >
                <Trash2 size={16} />
                Delete Selected
              </Button>
            ) : null}
            {hasSelectedOrders ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedOrders([])}
              >
                Clear Selection
              </Button>
            ) : null}
          </div>
        </div>

        <div
          id="orders-bulk-actions-panel"
          className={`${styles.bulkSections} ${
            !isExpanded ? styles.bulkSectionsCollapsed : ""
          }`}
          aria-hidden={!isExpanded}
        >
          {hasSelectedOrders && canUpdateOrders && (
            <div className={styles.bulkSection}>
              <div className={styles.bulkSectionTitle}>Delivery</div>

              <div className={styles.bulkSectionRow}>
                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>Delivery date</label>
                  <input
                    type="date"
                    className={styles.filterInput}
                    min={today}
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  isLoading={isAssigning}
                  disabled={!deliveryDate}
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
                  Assign Delivery Date
                </Button>
              </div>

              <div className={styles.bulkSectionRow}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bulkUpdateStatus("ordered")}
                >
                  Mark Ordered
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bulkUpdateStatus("dispatched")}
                >
                  Mark Dispatched
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bulkUpdateStatus("in_transit")}
                >
                  Mark In Transit
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bulkUpdateStatus("delivered")}
                >
                  Mark Delivered
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => bulkUpdateStatus("returned")}
                >
                  Mark Returned
                </Button>
              </div>
            </div>
          )}

          {canReadDelivery && (
            <div className={styles.bulkSection}>
              <div className={styles.bulkSectionTitle}>Stock Needed</div>
              <p className={styles.bulkSectionHelp}>
                Select a source. A delivery date includes paid one-time orders,
                scheduled subscriptions, and confirmed one-time add-ons for
                that day.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                className={styles.bulkFileInput}
                accept=".csv,.xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setOrdersFile(file);
                }}
              />

              <div className={styles.bulkSectionRow}>
                <div className={styles.filterGroup}>
                  <label className={styles.filterLabel}>Calculate from</label>
                  <select
                    className={styles.filterInput}
                    value={stockSource}
                    onChange={(e) =>
                      setStockSource(e.target.value as StockSource)
                    }
                  >
                    <option value="delivery_date">Delivery date</option>
                    <option
                      value="selected_orders"
                      disabled={!hasSelectedOrders}
                    >
                      Selected orders
                    </option>
                    <option value="file">Uploaded file</option>
                  </select>
                </div>

                {stockSource === "delivery_date" ? (
                  <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>
                      Stock delivery date
                    </label>
                    <input
                      type="date"
                      className={styles.filterInput}
                      value={stockDeliveryDate}
                      onChange={(e) => setStockDeliveryDate(e.target.value)}
                    />
                  </div>
                ) : null}

                {stockSource !== "file" ? (
                  <div className={styles.filterGroup}>
                    <label className={styles.filterLabel}>Order type</label>
                    <select
                      className={styles.filterInput}
                      value={stockOrderTypeScope}
                      onChange={(e) =>
                        setStockOrderTypeScope(
                          e.target.value as
                            | "both"
                            | "normal"
                            | "subscription",
                        )
                      }
                    >
                      <option value="both">All orders</option>
                      <option value="normal">One-time orders</option>
                      <option value="subscription">Subscriptions</option>
                    </select>
                  </div>
                ) : null}

                {stockSource === "file" ? (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {ordersFile ? "Change file" : "Choose file"}
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
                            if (fileInputRef.current)
                              fileInputRef.current.value = "";
                          }}
                        >
                          Clear file
                        </Button>
                      </>
                    ) : null}
                  </>
                ) : null}

                <Button
                  variant="outline"
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
                        ordersFile:
                          stockSource === "file"
                            ? ordersFile || undefined
                            : undefined,
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
                  Get Stock Needed
                </Button>
              </div>
            </div>
          )}
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
              Requirements for {stockResult.sources.deliveryDate}: {" "}
              {stockResult.sources.ordersFound || 0} order records and {" "}
              {stockResult.sources.scheduledSubscriptionDeliveriesFound || 0}
              {" "}scheduled subscription deliveries.
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
