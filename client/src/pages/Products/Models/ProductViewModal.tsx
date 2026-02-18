import { Edit2 } from "lucide-react";
import {
  Button,
  Badge,
  Modal,
  ModalFooter,
  FormGrid,
  FormValue,
  FormSection,
} from "../../../components/common";
import styles from "../Products.module.css";
import { getImageUrl, getStatusBadge } from "../product.utils";

const ProductViewModal = ({
  isViewModalOpen,
  setIsViewModalOpen,
  selectedProduct,
  handleEditProduct,
}: any) => {
  if (!selectedProduct) return null;

  const variants = selectedProduct.variants || [];

  return (
    <Modal
      isOpen={isViewModalOpen}
      onClose={() => setIsViewModalOpen(false)}
      title="Product Details"
      size="lg"
    >
      <div className={styles.productDetail}>
        <div className={styles.detailHeader}>
          <img
            src={getImageUrl(selectedProduct.thumbnailImage)}
            alt={selectedProduct.name}
            className={styles.detailImage}
          />
          <div className={styles.detailInfo}>
            <h2>{selectedProduct.name}</h2>
            <div className={styles.detailMeta}>
              {getStatusBadge(selectedProduct.status)}
              <Badge variant="default">{selectedProduct.category}</Badge>
            </div>
          </div>
        </div>

        <FormSection title="Description">
          <p className={styles.detailDescription}>
            {selectedProduct.description}
          </p>
        </FormSection>

        {variants.length > 0 && (
          <FormSection title="Variants">
            <div className={styles.variantsList}>
              {variants.map((v: any) => {
                const available =
                  (v.stockQuantity || 0) - (v.reservedQuantity || 0);

                return (
                  <div key={v._id} className={styles.variantItem}>
                    <span>
                      {v.name}{" "}
                      {v.sku ? (
                        <span className={styles.productSku}>({v.sku})</span>
                      ) : null}
                    </span>
                    <span>
                      £{Number(v.price || 0).toFixed(2)} · {available} avail
                    </span>
                  </div>
                );
              })}
            </div>
          </FormSection>
        )}

        <FormSection title="Product Info">
          <FormGrid>
            <FormValue
              label="Slug"
              value={selectedProduct.slug}
              muted={!selectedProduct.slug}
            />
            <FormValue
              label="Allergens"
              value={(selectedProduct.allergens || []).join(", ") || "None"}
            />
            <FormValue
              label="Storage Notes"
              value={selectedProduct.storageNotes}
              muted={!selectedProduct.storageNotes}
            />
          </FormGrid>
        </FormSection>
      </div>

      <ModalFooter>
        <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
          Close
        </Button>
        <Button
          onClick={() => {
            setIsViewModalOpen(false);
            handleEditProduct(selectedProduct);
          }}
        >
          <Edit2 size={16} /> Edit Product
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default ProductViewModal;
