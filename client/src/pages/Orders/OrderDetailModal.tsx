import { Button, Modal, ModalFooter } from "../../components/common";
import { getStatusBadge, getPaymentBadge } from "./order.utils";
import styles from "./Orders.module.css";
import { useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";

const OrderDetailModal = ({
  selectedOrder,
  isDetailModalOpen,
  setIsDetailModalOpen,
  setIsStatusModalOpen,
  refundOrder,
}: any) => {
  const { hasPermission } = usePermissions();
  const canRefundPermission = hasPermission("orders.refund");
  const canUpdatePermission = hasPermission("orders.update");

  const [isRefundConfirmOpen, setIsRefundConfirmOpen] = useState(false);
  const [isRefunding, setIsRefunding] = useState(false);

  const isAlreadyRefunded = selectedOrder?.paymentStatus === "refunded";
  const canRefund =
    canRefundPermission && Boolean(selectedOrder?.id) && !isAlreadyRefunded;

  return (
    <>
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={`Order ${selectedOrder?.orderNumber || ""}`}
        size="lg"
      >
        {selectedOrder ? (
          <div className={styles.orderDetail}>
            <div className={styles.detailHeader}>
              <div className={styles.detailStatus}>
                {getStatusBadge(
                  selectedOrder.deliveryStatus?.replace(/_/g, " "),
                )}
                {getPaymentBadge(selectedOrder.paymentStatus)}
              </div>
              <span className={styles.detailDate}>
                Created:{" "}
                {new Date(selectedOrder.createdAt).toLocaleString("en-GB")}
              </span>
            </div>

            <div className={styles.detailGrid}>
              <div className={styles.detailSection}>
                <h4 className={styles.detailTitle}>Customer</h4>
                <p>{selectedOrder.customer.name}</p>
                <p>{selectedOrder.customer.email}</p>
                <p>{selectedOrder.customer.phone}</p>
              </div>

              <div className={styles.detailSection}>
                <h4 className={styles.detailTitle}>Delivery Address</h4>
                <p>{selectedOrder.deliveryAddress.line1}</p>
                {selectedOrder.deliveryAddress.line2 && (
                  <p>{selectedOrder.deliveryAddress.line2}</p>
                )}
                <p>
                  {selectedOrder.deliveryAddress.city},{" "}
                  {selectedOrder.deliveryAddress.postcode}
                </p>
              </div>

              <div className={styles.detailSection}>
                <h4 className={styles.detailTitle}>Delivery Slot</h4>
                <p>
                  {new Date(selectedOrder.deliverySlot.date).toLocaleDateString(
                    "en-GB",
                    {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                    },
                  )}
                </p>
                <p>{selectedOrder.deliverySlot.timeWindow}</p>
              </div>
            </div>

            <div className={styles.itemsSection}>
              <h4 className={styles.detailTitle}>Order Items</h4>
              <table className={styles.itemsTable}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Variant</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map((item: any, index: number) => (
                    <tr key={index}>
                      <td>{item.name}</td>
                      <td>{item.variant || "-"}</td>
                      <td>{item.quantity}</td>
                      <td>£{item.unitPrice.toFixed(2)}</td>
                      <td>£{(item.quantity * item.unitPrice).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.totalsSection}>
              <div className={styles.totalRow}>
                <span>Subtotal</span>
                <span>£{selectedOrder.subtotal.toFixed(2)}</span>
              </div>
              <div className={styles.totalRow}>
                <span>Delivery Fee</span>
                <span>£{selectedOrder.deliveryFee.toFixed(2)}</span>
              </div>
              {selectedOrder.discount > 0 && (
                <div className={styles.totalRow}>
                  <span>Discount</span>
                  <span className={styles.discount}>
                    -£{selectedOrder.discount.toFixed(2)}
                  </span>
                </div>
              )}
              <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                <span>Total</span>
                <span>£{selectedOrder.total.toFixed(2)}</span>
              </div>
            </div>

            {(selectedOrder.customerNotes || selectedOrder.internalNotes) && (
              <div className={styles.notesSection}>
                {selectedOrder.customerNotes && (
                  <div className={styles.noteBox}>
                    <h5>Customer Notes</h5>
                    <p>{selectedOrder.customerNotes}</p>
                  </div>
                )}
                {selectedOrder.internalNotes && (
                  <div className={`${styles.noteBox} ${styles.internalNote}`}>
                    <h5>Internal Notes</h5>
                    <p>{selectedOrder.internalNotes}</p>
                  </div>
                )}
              </div>
            )}

            <div className={styles.historySection}>
              <h4 className={styles.detailTitle}>Order Timeline</h4>
              <div className={styles.timeline}>
                {selectedOrder.history.map((entry: any, index: number) => (
                  <div key={index} className={styles.timelineItem}>
                    <div className={styles.timelineDot} />
                    <div className={styles.timelineContent}>
                      <span className={styles.timelineStatus}>
                        {entry.status.replace(/_/g, " ")}
                      </span>
                      <span className={styles.timelineMeta}>
                        {new Date(entry.timestamp).toLocaleString("en-GB")} •{" "}
                        {entry.user}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div style={{ padding: "var(--space-4)" }}>Loading order…</div>
        )}

        <ModalFooter>
          <Button variant="outline" onClick={() => setIsDetailModalOpen(false)}>
            Close
          </Button>
          {canRefundPermission ? (
            <Button
              variant="danger"
              disabled={!canRefund}
              onClick={() => {
                if (!canRefund) return;
                setIsRefundConfirmOpen(true);
              }}
            >
              Refund
            </Button>
          ) : null}
          {canUpdatePermission &&
            typeof setIsStatusModalOpen === "function" && (
              <Button
                onClick={() => {
                  setIsDetailModalOpen(false);
                  setIsStatusModalOpen(true);
                }}
              >
                Update Status
              </Button>
            )}
        </ModalFooter>
      </Modal>

      {canRefundPermission ? (
        <Modal
          isOpen={isRefundConfirmOpen}
          onClose={() => {
            if (!isRefunding) setIsRefundConfirmOpen(false);
          }}
          title="Confirm refund"
          size="sm"
        >
          <p>
            Refund order {selectedOrder?.orderNumber || ""}? This action cannot
            be undone.
          </p>

          <ModalFooter>
            <Button
              variant="outline"
              disabled={isRefunding}
              onClick={() => setIsRefundConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              isLoading={isRefunding}
              onClick={async () => {
                if (!selectedOrder?.id) return;
                setIsRefunding(true);
                try {
                  await refundOrder?.(selectedOrder.id);
                  setIsRefundConfirmOpen(false);
                  setIsDetailModalOpen(false);
                } finally {
                  setIsRefunding(false);
                }
              }}
            >
              Refund
            </Button>
          </ModalFooter>
        </Modal>
      ) : null}
    </>
  );
};

export default OrderDetailModal;
