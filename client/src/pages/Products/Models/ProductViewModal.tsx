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
import { getStatusBadge } from "../product.utils";

const ProductViewModal = ({
  isViewModalOpen,
  setIsViewModalOpen,
  selectedProduct,
  handleEditProduct,
}: any) => {
  if (!selectedProduct) return null;

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
            src={selectedProduct.images[0]}
            alt={selectedProduct.name}
            className={styles.detailImage}
          />
          <div className={styles.detailInfo}>
            <h2>{selectedProduct.name}</h2>
            <div className={styles.detailMeta}>
              {getStatusBadge(selectedProduct.status)}
              <Badge variant="default">{selectedProduct.category}</Badge>
              {selectedProduct.badges.map((badge: string, i: number) => (
                <Badge key={i} variant="info">
                  {badge}
                </Badge>
              ))}
            </div>
            <p className={styles.detailPrice}>
              £{selectedProduct.price.toFixed(2)}
            </p>
          </div>
        </div>

        <FormSection title="Description">
          <p className={styles.detailDescription}>
            {selectedProduct.longDescription || selectedProduct.description}
          </p>
        </FormSection>

        {selectedProduct.variants && selectedProduct.variants.length > 0 && (
          <FormSection title="Variants">
            <div className={styles.variantsList}>
              {selectedProduct.variants.map((v: any) => (
                <div key={v.id} className={styles.variantItem}>
                  <span>{v.name}</span>
                  <span>£{v.price.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </FormSection>
        )}

        <FormSection title="Stock & Product Info">
          <FormGrid>
            <FormValue
              label="Stock Quantity"
              value={selectedProduct.stock.quantity}
            />
            <FormValue
              label="Low Stock Threshold"
              value={selectedProduct.stock.lowStockThreshold}
            />
            <FormValue
              label="Stock Status"
              value={
                selectedProduct.stock.inStock ? "In Stock" : "Out of Stock"
              }
            />
            <FormValue
              label="SKU"
              value={selectedProduct.sku}
              muted={!selectedProduct.sku}
            />
            <FormValue
              label="Allergens"
              value={selectedProduct.allergens.join(", ") || "None"}
            />
            <FormValue
              label="Storage Notes"
              value={selectedProduct.storageNotes}
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
