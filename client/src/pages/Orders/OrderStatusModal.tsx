import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Camera, Upload } from "lucide-react";
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

const statusIndex = (status: string) => STATUSES.indexOf(status as typeof STATUSES[number]);

function StatusContainer({ inline, open, onClose, busy, children }: {
  inline: boolean; open: boolean; onClose: () => void; busy: boolean; children: ReactNode;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (inline && open) heading.current?.focus({ preventScroll: true });
  }, [inline, open]);
  if (inline) return (
    <div id="order-status-editor" className={styles.inlineStatusQuick}>
      {children}
    </div>
  );
  return <Modal isOpen={open} onClose={onClose} title="Update Order Status" size="sm" showCloseButton={!busy}>{children}</Modal>;
}

const OrderStatusModal = ({
  inline = false,
  footerContainerId,
  selectedOrder,
  isStatusModalOpen,
  setIsStatusModalOpen,
  updateOrderStatus,
}: any) => {
  const Footer = inline ? "div" : ModalFooter;
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
  const [proofError, setProofError] = useState("");
  const [deliveryNote, setDeliveryNote] = useState<string>("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [footerContainer, setFooterContainer] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!inline || !footerContainerId) return;
    setFooterContainer(document.getElementById(footerContainerId));
  }, [inline, footerContainerId]);

  const customerInstructions =
    typeof selectedOrder?.customerInstructions === "string"
      ? selectedOrder.customerInstructions.trim()
      : "";

  useEffect(() => {
    setSelectedStatus(null);
    setProofFile(null);
    setProofError("");
    setDeliveryNote("");
  }, [selectedOrder?.id]);

  useEffect(() => {
    if (selectedStatus !== "delivered") {
      setProofFile(null);
      setProofError("");
      setDeliveryNote("");
    }
  }, [selectedStatus]);

  if (!hasPermission("orders.update")) return null;
  if (!selectedOrder) return null;

  const normalizedCurrent = String(
    selectedOrder.deliveryStatus || "",
  ).toLowerCase();
  const isDeliveredLockedForDriver =
    isDriver && normalizedCurrent === "delivered";
  const currentStatusIndex = statusIndex(normalizedCurrent);

  const handleClose = () => {
    if (isUpdating) return;
    setSelectedStatus(null);
    setProofFile(null);
    setProofError("");
    setDeliveryNote("");
    setIsStatusModalOpen(false);
  };

  const canMark =
    !!selectedStatus &&
    statusIndex(selectedStatus) > currentStatusIndex &&
    !isUpdating &&
    !isDeliveredLockedForDriver;

  const handleMark = async () => {
    if (!selectedStatus || isUpdating || statusIndex(selectedStatus) <= currentStatusIndex) return;

    const deliveryProofFile =
      selectedStatus === "delivered" ? (proofFile ?? undefined) : undefined;

    setIsUpdating(true);
    try {
      await updateOrderStatus(
        selectedOrder.id,
        selectedStatus,
        deliveryProofFile,
        deliveryNote,
      );
      if (mountedRef.current) {
        setSelectedStatus(null);
        setProofFile(null);
        setProofError("");
        setDeliveryNote("");
      }
    } finally {
      if (mountedRef.current) {
        setIsUpdating(false);
      }
    }
  };

  const selectProofFile = (file: File | null) => {
    setProofError("");
    if (!file) {
      setProofFile(null);
      return;
    }
    if (!file.type.startsWith("image/")) {
      setProofFile(null);
      setProofError("Choose an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setProofFile(null);
      setProofError("The image must be smaller than 8 MB.");
      return;
    }
    setProofFile(file);
  };

  const statusDetails = (
    <>
      {customerInstructions && selectedStatus === "delivered" && (
        <div className={styles.proofSection}>
          <div className={styles.proofLabel}>Customer instructions</div>
          <p className={styles.statusCustomerInstructions}>{customerInstructions}</p>
        </div>
      )}

      {(!inline || selectedStatus === "delivered") && <div className={styles.proofSection}>
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

        <input ref={cameraInputRef} className={styles.hiddenInput} type="file" accept="image/*" capture="environment" disabled={selectedStatus !== "delivered"} onChange={(e) => selectProofFile(e.target.files?.[0] ?? null)} />
        <input ref={uploadInputRef} className={styles.hiddenInput} type="file" accept="image/*" disabled={selectedStatus !== "delivered"} onChange={(e) => selectProofFile(e.target.files?.[0] ?? null)} />

        <div className={styles.proofHint}>
          {selectedStatus !== "delivered"
            ? "Select Delivered to add a photo"
            : proofFile
              ? `Selected: ${proofFile.name}`
              : "Optional when marking as delivered"}
        </div>
        {proofError ? <div className={styles.proofError} role="alert">{proofError}</div> : null}
      </div>}

      {selectedStatus === "delivered" && (
        <div className={styles.proofSection}>
          <div className={styles.proofLabel}>Delivery note <span>(optional)</span></div>
          <textarea
            className={styles.notesTextarea}
            aria-label="Delivery note"
            value={deliveryNote}
            onChange={(e) => setDeliveryNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Add a note for the customer"
            disabled={isUpdating}
          />
          <div className={styles.proofHint}>Included in the delivery confirmation email.</div>
        </div>
      )}
    </>
  );

  return (
    <StatusContainer inline={inline} open={isStatusModalOpen} onClose={handleClose} busy={isUpdating}>
      <div className={styles.statusModal} aria-busy={isUpdating}>
        {!inline && <p className={styles.statusModalText}>
          Update status for order <strong>{selectedOrder.orderNumber}</strong>
        </p>}

        {!inline && <p className={styles.statusModalCurrent}>
          Current status: {getStatusBadge(selectedOrder.deliveryStatus)}
        </p>}

        {isDeliveredLockedForDriver && (
          <p className={styles.statusModalCurrent}>
            Delivered orders are locked and can’t be changed.
          </p>
        )}

        <label className={inline ? styles.visuallyHidden : styles.statusOptionsLabel} htmlFor="order-delivery-status">
          New status
        </label>
        <select
          id="order-delivery-status"
          className={styles.statusSelect}
          value={selectedStatus || ""}
          onChange={(event) => {
            const value = event.target.value || null;
            setSelectedStatus(value);
            setIsStatusModalOpen(Boolean(value));
          }}
          disabled={isUpdating || isDeliveredLockedForDriver}
        >
          <option value="">{inline ? "Update status" : "Select a status"}</option>
          {statuses.map((status) => {
            const isCurrent = normalizedCurrent === status;
            const isEarlier = statusIndex(status) < currentStatusIndex;
            return (
              <option
                key={status}
                value={status}
                disabled={isCurrent || isEarlier}
              >
                {status.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase())}
                {isCurrent ? " (current)" : isEarlier ? " (completed)" : ""}
              </option>
            );
          })}
        </select>

        {!inline && statusDetails}
      </div>

      {(!inline || selectedStatus) && (inline && footerContainer ? createPortal(<div className={styles.inlineStatusPanel}>
        {statusDetails}
        <Footer className={styles.inlineStatusFooter}>
          <Button variant="outline" disabled={isUpdating} onClick={handleClose}>Cancel</Button>
          <Button className={styles.statusSaveAction} variant="primary" isLoading={isUpdating} disabled={!canMark} onClick={handleMark}>
            {isUpdating ? "Saving..." : "Save"}
          </Button>
        </Footer>
      </div>, footerContainer) : !inline ? <Footer>
        <Button
          fullWidth
          variant="primary"
          isLoading={isUpdating}
          disabled={!canMark}
          onClick={handleMark}
        >
          {isUpdating ? "Saving..." : "Save"}
        </Button>
      </Footer> : null)}
    </StatusContainer>
  );
};

export default OrderStatusModal;
