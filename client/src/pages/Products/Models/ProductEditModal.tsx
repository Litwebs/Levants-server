import { Save, Upload, X, Image } from "lucide-react";
import {
  Button,
  Modal,
  ModalFooter,
  FormGrid,
  FormRow,
  FormSection,
} from "../../../components/common";
import styles from "../Products.module.css";

const categories = ["Milk", "Milkshakes", "Cream", "Honey", "Butter", "Cheese"];
const statuses = ["active", "draft", "archived"];

const ProductEditModal = ({
  isEditModalOpen,
  setIsEditModalOpen,

  editForm,
  setEditForm,

  productImages,
  thumbnailInputRef,
  galleryInputRef,

  handleThumbnailUpload,
  handleGalleryUpload,
  handleRemoveThumbnail,
  handleRemoveGalleryImage,

  handleSaveEdit,
}: any) => {
  return (
    <Modal
      isOpen={isEditModalOpen}
      onClose={() => setIsEditModalOpen(false)}
      title="Edit Product"
      size="lg"
    >
      <FormGrid>
        <FormRow label="Product Name" htmlFor="edit-name">
          <input
            id="edit-name"
            type="text"
            value={editForm.name || ""}
            onChange={(e) =>
              setEditForm((p: any) => ({ ...p, name: e.target.value }))
            }
          />
        </FormRow>

        <FormRow label="Category" htmlFor="edit-category">
          <select
            id="edit-category"
            value={editForm.category || "Milk"}
            onChange={(e) =>
              setEditForm((p: any) => ({
                ...p,
                category: e.target.value,
              }))
            }
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </FormRow>

        <FormRow label="Description" htmlFor="edit-description">
          <textarea
            id="edit-description"
            rows={2}
            value={editForm.description || ""}
            onChange={(e) =>
              setEditForm((p: any) => ({
                ...p,
                description: e.target.value,
              }))
            }
          />
        </FormRow>

        <FormRow label="Long Description" htmlFor="edit-long-description">
          <textarea
            id="edit-long-description"
            rows={3}
            value={editForm.longDescription || ""}
            onChange={(e) =>
              setEditForm((p: any) => ({
                ...p,
                longDescription: e.target.value,
              }))
            }
          />
        </FormRow>

        <FormRow label="Price (£)" htmlFor="edit-price">
          <input
            id="edit-price"
            type="number"
            step="0.01"
            min="0"
            value={editForm.price ?? 0}
            onChange={(e) =>
              setEditForm((p: any) => ({
                ...p,
                price: parseFloat(e.target.value) || 0,
              }))
            }
          />
        </FormRow>

        <FormRow label="Status" htmlFor="edit-status">
          <select
            id="edit-status"
            value={editForm.status || "draft"}
            onChange={(e) =>
              setEditForm((p: any) => ({
                ...p,
                status: e.target.value,
              }))
            }
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
        </FormRow>

        <FormRow label="Stock Quantity" htmlFor="edit-stock">
          <input
            id="edit-stock"
            type="number"
            min="0"
            value={editForm.stock?.quantity ?? 0}
            onChange={(e) =>
              setEditForm((p: any) => ({
                ...p,
                stock: {
                  ...p.stock,
                  quantity: parseInt(e.target.value) || 0,
                  inStock: parseInt(e.target.value) > 0,
                },
              }))
            }
          />
        </FormRow>

        <FormRow label="Low Stock Alert" htmlFor="edit-threshold">
          <input
            id="edit-threshold"
            type="number"
            min="0"
            value={editForm.stock?.lowStockThreshold ?? 10}
            onChange={(e) =>
              setEditForm((p: any) => ({
                ...p,
                stock: {
                  ...p.stock,
                  lowStockThreshold: parseInt(e.target.value) || 10,
                },
              }))
            }
          />
        </FormRow>

        <FormRow label="Allergens" htmlFor="edit-allergens">
          <input
            id="edit-allergens"
            type="text"
            placeholder="Comma-separated (e.g., Milk, Nuts)"
            value={editForm.allergens?.join(", ") || ""}
            onChange={(e) =>
              setEditForm((p: any) => ({
                ...p,
                allergens: e.target.value
                  .split(",")
                  .map((a) => a.trim())
                  .filter(Boolean),
              }))
            }
          />
        </FormRow>

        <FormRow label="Storage Notes" htmlFor="edit-storage">
          <input
            id="edit-storage"
            type="text"
            value={editForm.storageNotes || ""}
            onChange={(e) =>
              setEditForm((p: any) => ({
                ...p,
                storageNotes: e.target.value,
              }))
            }
          />
        </FormRow>

        {/* IMAGES — IDENTICAL TO CREATE */}
        <FormSection title="Product Images">
          <div className={styles.thumbnailUpload}>
            <label className={styles.uploadLabel}>Thumbnail Image</label>

            {productImages.thumbnail ? (
              <div className={styles.thumbnailPreview}>
                <img src={productImages.thumbnail} alt="Thumbnail" />
                <button
                  type="button"
                  className={styles.removeImageBtn}
                  onClick={handleRemoveThumbnail}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div
                className={styles.uploadPlaceholder}
                onClick={() => thumbnailInputRef.current?.click()}
              >
                <Image size={32} />
                <span>Click to upload thumbnail</span>
              </div>
            )}

            <input
              ref={thumbnailInputRef}
              type="file"
              accept="image/*"
              onChange={handleThumbnailUpload}
              className={styles.hiddenInput}
            />
          </div>

          <div className={styles.galleryUpload}>
            <label className={styles.uploadLabel}>
              Gallery Images ({productImages.gallery.length}/10)
            </label>

            <div className={styles.galleryGrid}>
              {productImages.gallery.map((img: string, index: number) => (
                <div key={index} className={styles.galleryItem}>
                  <img src={img} alt={`Gallery ${index + 1}`} />
                  <button
                    type="button"
                    className={styles.removeImageBtn}
                    onClick={() => handleRemoveGalleryImage(index)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}

              {productImages.gallery.length < 10 && (
                <div
                  className={styles.addGalleryImage}
                  onClick={() => galleryInputRef.current?.click()}
                >
                  <Upload size={24} />
                  <span>Add</span>
                </div>
              )}

              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleGalleryUpload}
                className={styles.hiddenInput}
              />
            </div>
          </div>
        </FormSection>
      </FormGrid>

      <ModalFooter>
        <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
          Cancel
        </Button>
        <Button onClick={handleSaveEdit}>
          <Save size={16} /> Save Changes
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default ProductEditModal;
