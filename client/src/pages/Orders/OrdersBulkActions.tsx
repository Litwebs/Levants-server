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
import { usePermissions } from "@/hooks/usePermissions";
import styles from "./Orders.module.css";
import { useRef, useState } from "react";
import type { OrdersStockRequirements } from "../../context/Orders";

interface Props {
  selectedOrders: string[];
  bulkUpdateStatus: (status: string) => void | Promise<void>;
  bulkAssignDeliveryDate: (dateInput: string) => void | Promise<void>;
  getOrdersStockRequirements: (params?: {
    orderIds?: string[];
    ordersFile?: File;
  }) => Promise<OrdersStockRequirements | null>;
  setSelectedOrders: (ids: string[]) => void;
}

const OrdersBulkActions = ({
  selectedOrders,
  bulkUpdateStatus,
  bulkAssignDeliveryDate,
  getOrdersStockRequirements,
  setSelectedOrders,
}: Props) => {
  const { hasPermission } = usePermissions();
  const canUpdateOrders = hasPermission("orders.update");
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
  const [stockResult, setStockResult] =
    useState<OrdersStockRequirements | null>(null);
  const [isStockModalOpen, setIsStockModalOpen] = useState(false);

  if (!canUpdateOrders && !canReadDelivery) return null;
  if (!selectedOrders.length) return null;

  return (
    <>
      <Card className={styles.bulkActions}>
        <div className={styles.bulkContent}>
          <span className={styles.bulkCount}>
            {selectedOrders.length} orders selected
          </span>

          <div className={styles.bulkButtons}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedOrders([])}
            >
              Clear Selection
            </Button>
          </div>
        </div>

        <div className={styles.bulkSections}>
          {canUpdateOrders && (
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
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {ordersFile ? "Change File" : "Choose File"}
                </Button>

                {ordersFile && (
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
                      Clear File
                    </Button>
                  </>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  isLoading={isCalculatingStock}
                  onClick={async () => {
                    if (isCalculatingStock) return;
                    setIsCalculatingStock(true);
                    try {
                      const data = await getOrdersStockRequirements({
                        orderIds: selectedOrders,
                        ordersFile: ordersFile || undefined,
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
                    No items found for these orders.
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
    </>
  );
};

export default OrdersBulkActions;
