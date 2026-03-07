import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle, Clock, Upload, X } from "lucide-react";
import { Button, Modal, ModalFooter } from "../../components/common";
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
  const isDriver =
    String(roleName || "").toLowerCase() === "driver" ||
    (hasPermission("delivery.routes.read") &&
      !hasPermission("delivery.routes.update"));

  const statuses = useMemo(
    () => (isDriver ? DRIVER_STATUSES : STATUSES),
    [isDriver],
  );

  const mountedRef = useRef(false);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const uploadInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!isStatusModalOpen) return;
    setSelectedStatus(null);
    setProofFile(null);
  }, [isStatusModalOpen, selectedOrder?.id]);

  useEffect(() => {
    if (selectedStatus !== "delivered") setProofFile(null);
  }, [selectedStatus]);

  if (!hasPermission("orders.update")) return null;
  if (!selectedOrder) return null;

  const normalizedCurrent = String(
    selectedOrder.deliveryStatus || "",
  ).toLowerCase();
  const isDeliveredLockedForDriver =
    isDriver && normalizedCurrent === "delivered";

  const handleClose = () => {
    if (isUpdating) return;
    setIsStatusModalOpen(false);
  };

  const canMark =
    !!selectedStatus &&
    selectedStatus !== selectedOrder.deliveryStatus &&
    !isUpdating &&
    !isDeliveredLockedForDriver;

  const markLabel = selectedStatus
    ? `Mark as ${selectedStatus.replace(/_/g, " ")}`
    : "Mark";

  const handleMark = async () => {
    if (!selectedStatus || isUpdating) return;

    const deliveryProofFile =
      selectedStatus === "delivered" ? (proofFile ?? undefined) : undefined;

    setIsUpdating(true);
    try {
      await updateOrderStatus(
        selectedOrder.id,
        selectedStatus,
        deliveryProofFile,
      );
    } finally {
      if (mountedRef.current) {
        setIsUpdating(false);
      }
    }
  };

  return (
    <Modal
      isOpen={isStatusModalOpen}
      onClose={handleClose}
      title="Update Order Status"
      size="sm"
      showCloseButton={!isUpdating}
    >
      <div className={styles.statusModal} aria-busy={isUpdating}>
        <p className={styles.statusModalText}>
          Update status for order <strong>{selectedOrder.orderNumber}</strong>
        </p>

        <p className={styles.statusModalCurrent}>
          Current status: {getStatusBadge(selectedOrder.deliveryStatus)}
        </p>

        {isDeliveredLockedForDriver && (
          <p className={styles.statusModalCurrent}>
            Delivered orders are locked and can’t be changed.
          </p>
        )}

        <div className={styles.statusOptionsLabel}>Choose new status</div>
        <div className={styles.statusOptions}>
          {statuses.map((status) => (
            <button
              key={status}
              type="button"
              className={`${styles.statusOption} ${
                selectedOrder.deliveryStatus === status ? styles.current : ""
              } ${selectedStatus === status ? styles.selected : ""}`}
              onClick={() => {
                if (isUpdating || isDeliveredLockedForDriver) return;
                setSelectedStatus(status);
              }}
              disabled={
                isUpdating ||
                isDeliveredLockedForDriver ||
                selectedOrder.deliveryStatus === status
              }
            >
              {status === "ordered" ? (
                <Clock size={18} />
              ) : status === "returned" ? (
                <X size={18} />
              ) : (
                <CheckCircle size={18} />
              )}
              <span>{status.replace(/_/g, " ")}</span>
            </button>
          ))}
        </div>

        <div className={styles.proofSection}>
          <div className={styles.proofLabel}>Delivery proof (photo)</div>

          <div className={styles.proofActions}>
            <button
              type="button"
              className={styles.proofActionBtn}
              onClick={() => cameraInputRef.current?.click()}
              disabled={isUpdating || selectedStatus !== "delivered"}
            >
              <Camera size={18} />
              <span>Take photo</span>
            </button>
            <button
              type="button"
              className={styles.proofActionBtn}
              onClick={() => uploadInputRef.current?.click()}
              disabled={isUpdating || selectedStatus !== "delivered"}
            >
              <Upload size={18} />
              <span>Upload photo</span>
            </button>
          </div>

          <input
            ref={cameraInputRef}
            className={styles.hiddenInput}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={selectedStatus !== "delivered"}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setProofFile(file);
            }}
          />
          <input
            ref={uploadInputRef}
            className={styles.hiddenInput}
            type="file"
            accept="image/*"
            disabled={selectedStatus !== "delivered"}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setProofFile(file);
            }}
          />

          <div className={styles.proofHint}>
            {selectedStatus !== "delivered"
              ? "Select Delivered to add a photo"
              : proofFile
                ? `Selected: ${proofFile.name}`
                : "Optional (included when marking as delivered)"}
          </div>
        </div>
      </div>

      <ModalFooter>
        <Button
          fullWidth
          variant="primary"
          isLoading={isUpdating}
          disabled={!canMark}
          onClick={handleMark}
        >
          {isUpdating
            ? "Updating order..."
            : selectedStatus
              ? markLabel
              : "Select a status to continue"}
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default OrderStatusModal;
