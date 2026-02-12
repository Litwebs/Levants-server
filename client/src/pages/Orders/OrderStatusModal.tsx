import { Clock, CheckCircle, X } from "lucide-react";
import { Modal } from "../../components/common";
import styles from "./Orders.module.css";
import { getStatusBadge } from "./order.utils";

const STATUSES = [
  "ordered",
  "dispatched",
  "in_transit",
  "delivered",
  "returned",
] as const;

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
          Current status: {getStatusBadge(selectedOrder.deliveryStatus)}
        </p>

        <div className={styles.statusOptions}>
          {STATUSES.map((status) => (
            <button
              key={status}
              className={`${styles.statusOption} ${
                selectedOrder.deliveryStatus === status ? styles.current : ""
              }`}
              onClick={() => updateOrderStatus(selectedOrder.id, status)}
              disabled={selectedOrder.deliveryStatus === status}
            >
              {status === "ordered" && <Clock size={18} />}
              {status === "dispatched" && <CheckCircle size={18} />}
              {status === "in_transit" && <CheckCircle size={18} />}
              {status === "delivered" && <CheckCircle size={18} />}
              {status === "returned" && <X size={18} />}
              <span>{status.replace(/_/g, " ")}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
};

export default OrderStatusModal;
