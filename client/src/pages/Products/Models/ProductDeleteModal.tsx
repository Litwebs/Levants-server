import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button, Modal, ModalFooter } from "../../../components/common";
import styles from "../Products.module.css";

const ProductDeleteModal = ({
  isDeleteModalOpen,
  setIsDeleteModalOpen,
  selectedProduct,
  handleArchiveProduct,
  isSaving,
}: any) => {
  if (!selectedProduct) return null;

  const confirm = async () => {
    await handleArchiveProduct(selectedProduct);
    setIsDeleteModalOpen(false);
  };

  return (
    <Modal
      isOpen={isDeleteModalOpen}
      onClose={() => setIsDeleteModalOpen(false)}
      title="Archive Product"
      size="sm"
    >
      <div className={styles.deleteConfirm}>
        <AlertTriangle size={48} />
        <p>
          Archive <strong>{selectedProduct.name}</strong>?
        </p>
      </div>
      <ModalFooter>
        <Button
          variant="outline"
          onClick={() => setIsDeleteModalOpen(false)}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button variant="danger" onClick={confirm} disabled={isSaving}>
          {isSaving ? (
            <Loader2 size={16} className={styles.spinnerIcon} />
          ) : (
            <Trash2 size={16} />
          )}
          Archive
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default ProductDeleteModal;
