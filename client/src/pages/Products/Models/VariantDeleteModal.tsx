import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button, Modal, ModalFooter } from "../../../components/common";
import styles from "../Products.module.css";

const VariantDeleteModal = ({
  isOpen,
  onClose,
  variant,
  onConfirm,
  isDeleting,
  canDelete,
}: {
  isOpen: boolean;
  onClose: () => void;
  variant: { _id: string; name: string } | null;
  onConfirm: (variantId: string) => Promise<void> | void;
  isDeleting: boolean;
  canDelete: boolean;
}) => {
  if (!canDelete) return null;
  if (!variant) return null;

  const confirm = async () => {
    await onConfirm(variant._id);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delete Variant" size="sm">
      <div className={styles.deleteConfirm}>
        <AlertTriangle size={48} className={styles.deleteIcon} />
        <p>
          Delete <strong>{variant.name}</strong>?
        </p>
        <p className={styles.deleteNote}>
          This will archive the variant and remove it from listings.
        </p>
      </div>

      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={isDeleting}>
          Cancel
        </Button>
        <Button variant="danger" onClick={confirm} disabled={isDeleting}>
          {isDeleting ? (
            <Loader2 size={16} className={styles.spinnerIcon} />
          ) : (
            <Trash2 size={16} />
          )}
          Delete
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default VariantDeleteModal;
