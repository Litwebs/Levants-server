import { Loader2, Plus, Upload, X, Image } from "lucide-react";
import {
  Button,
  Modal,
  ModalFooter,
  FormGrid,
  FormRow,
  FormSection,
} from "../../../components/common";
import styles from "../Products.module.css";

const statuses = ["active", "draft", "archived"];

const ProductCreateModal = ({
  isCreateModalOpen,
  setIsCreateModalOpen,
  editForm,
  setEditForm,
  productImages,
  thumbnailInputRef,
  galleryInputRef,
  handleThumbnailUpload,
  handleGalleryUpload,
  handleRemoveThumbnail,
  handleRemoveGalleryImage,
  handleCreate,
  isSaving,
}: any) => {
  return (
    <Modal
      isOpen={isCreateModalOpen}
      onClose={() => setIsCreateModalOpen(false)}
      title="Create New Product"
      size="lg"
    >
      <FormGrid>
        <FormRow label="Product Name">
          <input
            value={editForm.name || ""}
            onChange={(e) =>
              setEditForm((p: any) => ({ ...p, name: e.target.value }))
            }
          />
        </FormRow>

        <FormRow label="Category">
          <input
            type="text"
            value={editForm.category || ""}
            onChange={(e) =>
              setEditForm((p: any) => ({ ...p, category: e.target.value }))
            }
          />
        </FormRow>

        <FormRow label="Description">
          <textarea
            rows={2}
            value={editForm.description || ""}
            onChange={(e) =>
              setEditForm((p: any) => ({ ...p, description: e.target.value }))
            }
          />
        </FormRow>

        <FormRow label="Status">
          <select
            value={editForm.status || "draft"}
            onChange={(e) =>
              setEditForm((p: any) => ({ ...p, status: e.target.value }))
            }
          >
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </FormRow>

        <FormRow label="Allergens">
          <input
            placeholder="Comma-separated (e.g. Milk, Nuts)"
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

        <FormRow label="Storage Notes">
          <input
            value={editForm.storageNotes || ""}
            onChange={(e) =>
              setEditForm((p: any) => ({
                ...p,
                storageNotes: e.target.value,
              }))
            }
          />
        </FormRow>

        {/* IMAGES */}
        <FormSection title="Product Images">
          <div className={styles.thumbnailUpload}>
            <label className={styles.uploadLabel}>Thumbnail Image</label>

            {productImages.thumbnail ? (
              <div className={styles.thumbnailPreview}>
                <img src={productImages.thumbnail} />
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
              className={styles.hiddenInput}
              onChange={handleThumbnailUpload}
            />
          </div>

          <div className={styles.galleryUpload}>
            <label className={styles.uploadLabel}>
              Gallery Images ({productImages.gallery.length}/10)
            </label>

            <div className={styles.galleryGrid}>
              {productImages.gallery.map((img: string, i: number) => (
                <div key={i} className={styles.galleryItem}>
                  <img src={img} />
                  <button
                    type="button"
                    className={styles.removeImageBtn}
                    onClick={() => handleRemoveGalleryImage(i)}
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
                className={styles.hiddenInput}
                onChange={handleGalleryUpload}
              />
            </div>
          </div>
        </FormSection>
      </FormGrid>

      <ModalFooter>
        <Button
          variant="outline"
          onClick={() => setIsCreateModalOpen(false)}
          disabled={isSaving}
        >
          Cancel
        </Button>
        <Button
          onClick={handleCreate}
          disabled={
            isSaving ||
            !editForm.name ||
            !editForm.category ||
            !editForm.description ||
            !productImages.thumbnail
          }
        >
          {isSaving ? (
            <Loader2 size={16} className={styles.spinnerIcon} />
          ) : (
            <Plus size={16} />
          )}
          Create Product
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default ProductCreateModal;
