import {
  ImagePlus,
  PackagePlus,
  Plus,
  Save,
  Upload,
  X,
} from "lucide-react";
import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  Input,
  LoadingScreen,
  PageContainer,
  Select,
} from "../../components/common";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { useToast } from "../../components/common/Toast";
import api from "../../context/api";
import type { AdminProduct, ProductStatus } from "./types";
import { getImageUrl, getImageUrls } from "./product.utils";
import styles from "./ProductCreatePage.module.css";

type ProductDraft = {
  name: string;
  category: string;
  description: string;
  status: ProductStatus;
  allergens: string;
  storageNotes: string;
};

const initialDraft: ProductDraft = {
  name: "",
  category: "",
  description: "",
  status: "draft",
  allergens: "",
  storageNotes: "",
};

const getProductDraft = (product: AdminProduct): ProductDraft => ({
  name: product.name ?? "",
  category: product.category ?? "",
  description: product.description ?? "",
  status: product.status ?? "draft",
  allergens: Array.isArray(product.allergens)
    ? product.allergens.join(", ")
    : "",
  storageNotes: product.storageNotes ?? "",
});

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_GALLERY_IMAGES = 10;

const readImage = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const ProductCreatePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { productId } = useParams<{ productId: string }>();
  const isEditing = Boolean(productId);
  const routedProduct = (
    location.state as { product?: AdminProduct } | null
  )?.product;
  const { showToast } = useToast();
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const [draft, setDraft] = useState<ProductDraft>(() =>
    routedProduct ? getProductDraft(routedProduct) : initialDraft,
  );
  const [thumbnail, setThumbnail] = useState(() =>
    routedProduct ? getImageUrl(routedProduct.thumbnailImage) : "",
  );
  const [gallery, setGallery] = useState<string[]>(() =>
    routedProduct ? getImageUrls(routedProduct.galleryImages) : [],
  );
  const [categories, setCategories] = useState<string[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [productLoading, setProductLoading] = useState(
    isEditing && !routedProduct,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let active = true;

    const loadCategories = async () => {
      try {
        const response = await api.get("/admin/products", {
          params: { page: 1, pageSize: 1 },
        });
        if (active) {
          setCategories(response.data?.meta?.categories ?? []);
        }
      } catch (error: any) {
        if (active) {
          showToast({
            type: "error",
            title: "Could not load categories",
            message: error?.response?.data?.message || error?.message,
          });
        }
      } finally {
        if (active) setCategoriesLoading(false);
      }
    };

    void loadCategories();
    return () => {
      active = false;
    };
  }, [showToast]);

  useEffect(() => {
    if (!productId) return;

    let active = true;
    const loadProduct = async () => {
      if (!routedProduct) setProductLoading(true);
      try {
        const response = await api.get(`/admin/products/${productId}`);
        const product = response.data?.data?.product as AdminProduct | undefined;
        if (!active || !product) return;

        setDraft(getProductDraft(product));
        setThumbnail(getImageUrl(product.thumbnailImage));
        setGallery(getImageUrls(product.galleryImages));
      } catch (error: any) {
        if (!active) return;
        showToast({
          type: "error",
          title: "Could not load product",
          message: error?.response?.data?.message || error?.message,
        });
        navigate("/products", { replace: true });
      } finally {
        if (active) setProductLoading(false);
      }
    };

    void loadProduct();
    return () => {
      active = false;
    };
  }, [navigate, productId, routedProduct, showToast]);

  const updateDraft = (field: keyof ProductDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const validateImage = (file: File) => {
    if (!file.type.startsWith("image/")) {
      showToast({
        type: "error",
        title: "Unsupported file",
        message: "Choose a JPG, PNG, WEBP, or another image file.",
      });
      return false;
    }

    if (file.size > MAX_IMAGE_BYTES) {
      showToast({
        type: "error",
        title: "Image is too large",
        message: "Each image must be smaller than 5 MB.",
      });
      return false;
    }

    return true;
  };

  const handleThumbnailChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !validateImage(file)) return;

    setThumbnail(await readImage(file));
    setErrors((current) => {
      const next = { ...current };
      delete next.thumbnail;
      return next;
    });
  };

  const handleGalleryChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const remaining = MAX_GALLERY_IMAGES - gallery.length;
    const files = Array.from(event.target.files ?? [])
      .filter(validateImage)
      .slice(0, remaining);
    event.target.value = "";
    if (files.length === 0) return;

    const images = await Promise.all(files.map(readImage));
    setGallery((current) => [...current, ...images].slice(0, MAX_GALLERY_IMAGES));
  };

  const validate = () => {
    const nextErrors: Record<string, string> = {};
    if (!draft.name.trim()) nextErrors.name = "Enter a product name.";
    if (!draft.category) nextErrors.category = "Choose a category.";
    if (!draft.description.trim()) {
      nextErrors.description = "Add a short product description.";
    }
    if (!thumbnail) nextErrors.thumbnail = "Add a thumbnail image.";
    setErrors(nextErrors);

    const firstError = Object.keys(nextErrors)[0];
    if (firstError) {
      const fieldIds: Record<string, string> = {
        name: "product-name",
        category: "product-category",
        description: "product-description",
        thumbnail: "product-thumbnail",
      };
      requestAnimationFrame(() => {
        const field = document.getElementById(fieldIds[firstError]);
        field?.scrollIntoView({ behavior: "smooth", block: "center" });
        field?.focus({ preventScroll: true });
      });
    }

    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validate() || isSaving) return;

    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: draft.name.trim(),
        category: draft.category,
        description: draft.description.trim(),
        status: draft.status,
        allergens: draft.allergens
          .split(",")
          .map((allergen) => allergen.trim())
          .filter(Boolean),
        storageNotes: draft.storageNotes.trim(),
        galleryImages: gallery,
      };

      if (!isEditing || thumbnail.startsWith("data:")) {
        payload.thumbnailImage = thumbnail;
      }

      const response = isEditing
        ? await api.put(`/admin/products/${productId}`, payload)
        : await api.post("/admin/products", payload);

      const product = response.data?.data?.product as AdminProduct | undefined;
      showToast({
        type: "success",
        title: isEditing ? "Product updated" : "Product created",
        message: isEditing
          ? "Your product changes have been saved."
          : "Add variants and inventory to finish setting it up.",
      });
      navigate(
        isEditing
          ? "/products"
          : product?._id
            ? `/products/${product._id}`
            : "/products",
        { replace: true },
      );
    } catch (error: any) {
      showToast({
        type: "error",
        title: isEditing ? "Failed to update product" : "Failed to create product",
        message: error?.response?.data?.message || error?.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (productLoading) {
    return <LoadingScreen label="Loading product…" />;
  }

  const pageTitle = isEditing ? "Edit product" : "Create product";
  const submitLabel = isEditing ? "Save changes" : "Create product";

  return (
    <PageContainer className={styles.page} width="wide">
      <Breadcrumb className={styles.breadcrumb}>
        <BreadcrumbList className={styles.breadcrumbList}>
          <BreadcrumbItem>
            <BreadcrumbLink asChild className={styles.breadcrumbLink}>
              <Link to="/products">Products</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator className={styles.breadcrumbSeparator} />
          <BreadcrumbItem>
            <BreadcrumbPage className={styles.breadcrumbCurrent}>
              {pageTitle}
            </BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className={styles.header}>
        <div className={styles.heading}>
          <h1>{pageTitle}</h1>
          <p>
            {isEditing
              ? "Update the catalogue details and product images."
              : "Add the catalogue details and images. Variants come next."}
          </p>
        </div>
        <Button
          type="submit"
          form="product-form"
          leftIcon={isEditing ? <Save size={16} /> : <Plus size={16} />}
          isLoading={isSaving}
          className={styles.headerSubmit}
        >
          {submitLabel}
        </Button>
      </header>

      <form
        id="product-form"
        className={styles.form}
        onSubmit={handleSubmit}
        noValidate
      >
        <div className={styles.contentGrid}>
          <Card className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon} aria-hidden="true">
                <PackagePlus size={20} />
              </span>
              <div>
                <h2>Product details</h2>
                <p>Information customers will use to identify this product.</p>
              </div>
            </div>

            <div className={styles.fieldsGrid}>
              <Input
                id="product-name"
                label="Product name"
                value={draft.name}
                onChange={(event) => updateDraft("name", event.target.value)}
                error={errors.name}
                placeholder="e.g. 2 Litre Homogenised"
                autoFocus
                required
                fullWidth
                size="sm"
              />

              <Select
                id="product-category"
                label="Category"
                value={draft.category}
                onChange={(value) => updateDraft("category", value)}
                error={errors.category}
                placeholder={categoriesLoading ? "Loading categories…" : "Select category"}
                options={categories.map((category) => ({
                  value: category,
                  label: category,
                }))}
                disabled={categoriesLoading}
                required
                fullWidth
              />

              <div className={styles.fullField}>
                <label htmlFor="product-description" className={styles.fieldLabel}>
                  Description
                </label>
                <textarea
                  id="product-description"
                  value={draft.description}
                  onChange={(event) =>
                    updateDraft("description", event.target.value)
                  }
                  className={errors.description ? styles.invalidControl : ""}
                  placeholder="Describe the product for customers"
                  rows={5}
                  required
                  aria-invalid={Boolean(errors.description)}
                  aria-describedby={
                    errors.description ? "product-description-error" : undefined
                  }
                />
                {errors.description ? (
                  <span id="product-description-error" className={styles.fieldError}>
                    {errors.description}
                  </span>
                ) : null}
              </div>

              <Select
                label="Publishing status"
                value={draft.status}
                onChange={(value) => updateDraft("status", value)}
                options={[
                  { value: "draft", label: "Draft" },
                  { value: "active", label: "Active" },
                  ...(isEditing
                    ? [{ value: "archived", label: "Archived" }]
                    : []),
                ]}
                fullWidth
              />

              <Input
                label="Allergens"
                value={draft.allergens}
                onChange={(event) =>
                  updateDraft("allergens", event.target.value)
                }
                placeholder="Milk, nuts"
                hint="Separate multiple allergens with commas."
                fullWidth
                size="sm"
              />

              <div className={styles.fullField}>
                <Input
                  label="Storage notes"
                  value={draft.storageNotes}
                  onChange={(event) =>
                    updateDraft("storageNotes", event.target.value)
                  }
                  placeholder="e.g. Keep refrigerated below 5°C"
                  fullWidth
                  size="sm"
                />
              </div>
            </div>
          </Card>

          <Card className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionIcon} aria-hidden="true">
                <ImagePlus size={20} />
              </span>
              <div>
                <h2>Product images</h2>
                <p>Use clear, well-lit images with a simple background.</p>
              </div>
            </div>

            <div className={styles.mediaSection}>
              <div className={styles.mediaLabelRow}>
                <label>Thumbnail</label>
                <span>Required · up to 5 MB</span>
              </div>

              {thumbnail ? (
                <div className={styles.thumbnailPreview}>
                  <img
                    src={thumbnail}
                    alt={`${isEditing ? "Product" : "New product"} thumbnail preview`}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    leftIcon={<Upload size={15} />}
                    onClick={() => thumbnailInputRef.current?.click()}
                    className={styles.replaceImageButton}
                  >
                    Replace
                  </Button>
                  <button
                    type="button"
                    className={styles.removeImageButton}
                    onClick={() => setThumbnail("")}
                    aria-label="Remove thumbnail"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <button
                  id="product-thumbnail"
                  type="button"
                  className={`${styles.thumbnailDropzone} ${
                    errors.thumbnail ? styles.invalidDropzone : ""
                  }`}
                  onClick={() => thumbnailInputRef.current?.click()}
                >
                  <span className={styles.uploadIcon}>
                    <Upload size={22} />
                  </span>
                  <strong>Choose a thumbnail</strong>
                  <span>JPG, PNG or WEBP</span>
                </button>
              )}
              {errors.thumbnail ? (
                <span className={styles.fieldError}>{errors.thumbnail}</span>
              ) : null}
              <input
                ref={thumbnailInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleThumbnailChange}
              />
            </div>

            <div className={styles.mediaSection}>
              <div className={styles.mediaLabelRow}>
                <label>Gallery</label>
                <span>{gallery.length}/{MAX_GALLERY_IMAGES} images</span>
              </div>
              <div className={styles.galleryGrid}>
                {gallery.map((image, index) => (
                  <div className={styles.galleryItem} key={`${image.slice(-16)}-${index}`}>
                    <img src={image} alt={`Gallery preview ${index + 1}`} />
                    <button
                      type="button"
                      className={styles.galleryRemoveButton}
                      onClick={() =>
                        setGallery((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      aria-label={`Remove gallery image ${index + 1}`}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {gallery.length < MAX_GALLERY_IMAGES ? (
                  <button
                    type="button"
                    className={styles.galleryAddButton}
                    onClick={() => galleryInputRef.current?.click()}
                  >
                    <Plus size={20} />
                    <span>Add images</span>
                  </button>
                ) : null}
              </div>
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={handleGalleryChange}
              />
            </div>
          </Card>
        </div>
      </form>
    </PageContainer>
  );
};

export default ProductCreatePage;
