import { AlertTriangle, Trash2 } from "lucide-react";
import { Button, Modal, ModalFooter } from "../../../components/common";
import styles from "../Products.module.css";

const ProductDeleteModal = ({
  isDeleteModalOpen,
  setIsDeleteModalOpen,
  selectedProduct,
  setProducts,
}: any) => {
  if (!selectedProduct) return null;

  const confirm = () => {
    setProducts((prev: any[]) =>
      prev.map((p) =>
        p.id === selectedProduct.id ? { ...p, status: "archived" } : p,
      ),
    );
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
        <Button variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
          Cancel
        </Button>
        <Button variant="danger" onClick={confirm}>
          <Trash2 size={16} /> Archive
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default ProductDeleteModal;
