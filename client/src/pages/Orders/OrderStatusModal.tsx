import { Clock, CheckCircle, X } from "lucide-react";
import { Modal } from "../../components/common";
import styles from "./Orders.module.css";
import { getStatusBadge } from "./order.utils";

const STATUSES = ["pending", "paid", "cancelled", "refunded"] as const;

const OrderStatusModal = ({
  selectedOrder,
  isStatusModalOpen,
  setIsStatusModalOpen,
  updateOrderStatus,
}: any) => {
  if (!selectedOrder) return null;

  return (
    <Modal
      isOpen={isStatusModalOpen}
      onClose={() => setIsStatusModalOpen(false)}
      title="Update Order Status"
      size="sm"
    >
      <div className={styles.statusModal}>
        <p className={styles.statusModalText}>
          Update status for order <strong>{selectedOrder.orderNumber}</strong>
        </p>

        <p className={styles.statusModalCurrent}>
          Current status: {getStatusBadge(selectedOrder.fulfillmentStatus)}
        </p>

        <div className={styles.statusOptions}>
          {STATUSES.map((status) => (
            <button
              key={status}
              className={`${styles.statusOption} ${
                selectedOrder.fulfillmentStatus === status ? styles.current : ""
              }`}
              onClick={() => updateOrderStatus(selectedOrder.id, status)}
              disabled={selectedOrder.fulfillmentStatus === status}
            >
              {status === "pending" && <Clock size={18} />}
              {status === "paid" && <CheckCircle size={18} />}
              {status === "cancelled" && <X size={18} />}
              {status === "refunded" && <CheckCircle size={18} />}
              <span>{status.replace(/_/g, " ")}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default OrderStatusModal;
