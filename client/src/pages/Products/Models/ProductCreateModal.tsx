import { Plus, Upload, X, Image } from "lucide-react";
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

const ProductCreateModal = ({
  isCreateModalOpen,
  setIsCreateModalOpen,
  editForm,
  setEditForm,
  productImages,
  setProductImages,
  thumbnailInputRef,
  galleryInputRef,
  setProducts,
  showToast,
}: any) => {
  const handleCreate = () => {
    const images = [
      productImages.thumbnail || "/placeholder.svg",
      ...productImages.gallery,
    ];

    setProducts((prev: any[]) => [
      ...prev,
      {
        id: `prod_${Date.now()}`,
        name: editForm.name || "",
        category: editForm.category || "Milk",
        description: editForm.description || "",
        longDescription: editForm.longDescription || "",
        price: editForm.price || 0,
        images,
        stock: editForm.stock || {
          inStock: true,
          quantity: 0,
          lowStockThreshold: 10,
        },
        status: editForm.status || "draft",
        badges: [],
        allergens: editForm.allergens || [],
        ingredients: editForm.ingredients || [],
        storageNotes: editForm.storageNotes || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    showToast({ type: "success", title: "Product created successfully" });
    setIsCreateModalOpen(false);
    setProductImages({ thumbnail: "", gallery: [] });
  };

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
          <select
            value={editForm.category || "Milk"}
            onChange={(e) =>
              setEditForm((p: any) => ({ ...p, category: e.target.value }))
            }
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </FormRow>

        <FormRow label="Short Description">
          <textarea
            rows={2}
            value={editForm.description || ""}
            onChange={(e) =>
              setEditForm((p: any) => ({ ...p, description: e.target.value }))
            }
          />
        </FormRow>

        <FormRow label="Long Description">
          <textarea
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

        <FormRow label="Price (£)">
          <input
            type="number"
            step="0.01"
            min="0"
            value={editForm.price || 0}
            onChange={(e) =>
              setEditForm((p: any) => ({ ...p, price: +e.target.value }))
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

        <FormRow label="Initial Stock">
          <input
            type="number"
            min="0"
            value={editForm.stock?.quantity || 0}
            onChange={(e) =>
              setEditForm((p: any) => ({
                ...p,
                stock: {
                  ...p.stock,
                  quantity: +e.target.value,
                  inStock: +e.target.value > 0,
                  lowStockThreshold: p.stock?.lowStockThreshold || 10,
                },
              }))
            }
          />
        </FormRow>

        <FormRow label="Low Stock Alert">
          <input
            type="number"
            min="0"
            value={editForm.stock?.lowStockThreshold || 10}
            onChange={(e) =>
              setEditForm((p: any) => ({
                ...p,
                stock: {
                  ...p.stock,
                  lowStockThreshold: +e.target.value,
                },
              }))
            }
          />
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
                  onClick={() =>
                    setProductImages((p: any) => ({ ...p, thumbnail: "" }))
                  }
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
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onloadend = () =>
                  setProductImages((p: any) => ({
                    ...p,
                    thumbnail: reader.result,
                  }));
                reader.readAsDataURL(file);
              }}
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
                    onClick={() =>
                      setProductImages((p: any) => ({
                        ...p,
                        gallery: p.gallery.filter(
                          (_: any, idx: number) => idx !== i,
                        ),
                      }))
                    }
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
                onChange={(e) => {
                  Array.from(e.target.files || []).forEach((file) => {
                    const reader = new FileReader();
                    reader.onloadend = () =>
                      setProductImages((p: any) => ({
                        ...p,
                        gallery: [...p.gallery, reader.result],
                      }));
                    reader.readAsDataURL(file);
                  });
                }}
              />
            </div>
          </div>
        </FormSection>
      </FormGrid>

      <ModalFooter>
        <Button variant="outline" onClick={() => setIsCreateModalOpen(false)}>
          Cancel
        </Button>
        <Button onClick={handleCreate} disabled={!editForm.name}>
          <Plus size={16} /> Create Product
        </Button>
      </ModalFooter>
    </Modal>
  );
};

export default ProductCreateModal;
