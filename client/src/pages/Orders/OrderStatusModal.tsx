import { useMemo, useState } from "react";
import { Clock, CheckCircle, X } from "lucide-react";
import { Modal } from "../../components/common";
import styles from "./Orders.module.css";
import { getStatusBadge } from "./order.utils";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/context/Auth/AuthContext";

const STATUSES = [
  "ordered",
  "dispatched",
  "in_transit",
  "delivered",
  "returned",
] as const;

const DRIVER_STATUSES = ["ordered", "delivered", "returned"] as const;

const OrderStatusModal = ({
  selectedOrder,
  isStatusModalOpen,
  setIsStatusModalOpen,
  updateOrderStatus,
}: any) => {
  const { hasPermission } = usePermissions();
  const { user } = useAuth();
  const roleName =
    typeof user?.role === "string" ? user.role : user?.role?.name;
  const isDriver = String(roleName || "").toLowerCase() === "driver";

  const [proofFile, setProofFile] = useState<File | null>(null);

  const statuses = useMemo(
    () => (isDriver ? DRIVER_STATUSES : STATUSES),
    [isDriver],
  );

  if (!hasPermission("orders.update")) return null;
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
          {statuses.map((status) => (
            <button
              key={status}
              className={`${styles.statusOption} ${
                selectedOrder.deliveryStatus === status ? styles.current : ""
              }`}
              onClick={() => {
                const shouldSendProof = status === "delivered";
                const file = shouldSendProof
                  ? (proofFile ?? undefined)
                  : undefined;
                updateOrderStatus(selectedOrder.id, status, file);
                setProofFile(null);
              }}
              disabled={
                selectedOrder.deliveryStatus === status ||
                (isDriver && status === "delivered" && !proofFile)
              }
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

        <div className={styles.proofSection}>
          <div className={styles.proofLabel}>Delivery proof (photo)</div>
          <input
            className={styles.proofInput}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setProofFile(file);
            }}
          />
          <div className={styles.proofHint}>
            {proofFile
              ? `Selected: ${proofFile.name}`
              : isDriver
                ? "Required when marking as delivered"
                : "Optional (included when marking as delivered)"}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default OrderStatusModal;
