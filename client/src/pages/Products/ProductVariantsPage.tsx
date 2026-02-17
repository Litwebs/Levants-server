import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  Loader2,
  Plus,
  Search,
  Save,
  Trash2,
  X,
} from "lucide-react";

import api from "../../context/api";
import {
  Badge,
  Button,
  Card,
  CardFooter,
  Input,
  Modal,
  ModalFooter,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  FormGrid,
  FormRow,
  FormSection,
  FormValue,
  Select,
} from "../../components/common";
import { useToast } from "../../components/common/Toast";
import { usePermissions } from "@/hooks/usePermissions";

import styles from "./Products.module.css";
import {
  AdminProduct,
  AdminProductVariant,
  MediaImage,
  VariantStatus,
} from "./types";
import { getImageUrl, getStatusBadge } from "./product.utils";
import VariantDeleteModal from "./Models/VariantDeleteModal";

type VariantForm = {
  name: string;
  sku: string;
  price: number | undefined;
  stockQuantity: number | undefined;
  lowStockAlert: number | undefined;
  status: VariantStatus;
  thumbnailImage: MediaImage;
};

const emptyCreateForm = (): VariantForm => ({
  name: "",
  sku: "",
  price: 0,
  stockQuantity: 0,
  lowStockAlert: 5,
  status: "active",
  thumbnailImage: { _id: "", url: "" },
});

const VariantViewModal = ({
  isOpen,
  onClose,
  variant,
}: {
  isOpen: boolean;
  onClose: () => void;
  variant: AdminProductVariant | null;
}) => {
  if (!variant) return null;
  const available =
    (variant.stockQuantity || 0) - (variant.reservedQuantity || 0);
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Variant Details" size="lg">
      <div className={styles.productDetail}>
        <div className={styles.detailHeader}>
          <img
            src={getImageUrl(variant.thumbnailImage)}
            alt={variant.name}
            className={styles.detailImage}
          />
          <div className={styles.detailInfo}>
            <h2>{variant.name}</h2>
            <div className={styles.detailMeta}>
              <Badge variant="default">{variant.sku}</Badge>
              <Badge
                variant={variant.status === "active" ? "success" : "default"}
              >
                {variant.status}
              </Badge>
            </div>
          </div>
        </div>

        <FormSection title="Inventory & Pricing">
          <FormGrid>
            <FormValue
              label="Price"
              value={`£${Number(variant.price || 0).toFixed(2)}`}
            />
            <FormValue
              label="Stock Quantity"
              value={variant.stockQuantity ?? 0}
            />
            <FormValue label="Reserved" value={variant.reservedQuantity ?? 0} />
            <FormValue label="Available" value={available} />
            <FormValue
              label="Low Stock Alert"
              value={variant.lowStockAlert ?? 0}
            />
          </FormGrid>
        </FormSection>
      </div>

      <ModalFooter>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </ModalFooter>
    </Modal>
  );
};

const VariantCreateModal = ({
  isOpen,
  onClose,
  onCreate,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (payload: VariantForm) => Promise<void>;
}) => {
  const [form, setForm] = useState<VariantForm>(() => emptyCreateForm());
  const [isSaving, setIsSaving] = useState(false);

  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setForm(emptyCreateForm());
  }, [isOpen]);

  const canSubmit =
    form.name.trim().length >= 2 &&
    form.sku.trim().length >= 2 &&
    Boolean(getImageUrl(form.thumbnailImage)) &&
    form.price !== undefined &&
    form.price >= 0 &&
    form.stockQuantity !== undefined &&
    form.stockQuantity >= 0;

  const handleThumbnailUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () =>
      setForm((p) => ({
        ...p,
        thumbnailImage: {
          _id: p.thumbnailImage?._id || "",
          url: String(reader.result),
        },
      }));
    reader.readAsDataURL(file);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Variant" size="lg">
      <FormGrid>
        <FormRow label="Variant Name" htmlFor="variant-name">
          <input
            id="variant-name"
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          />
        </FormRow>

        <FormRow label="SKU" htmlFor="variant-sku">
          <input
            id="variant-sku"
            value={form.sku}
            onChange={(e) => setForm((p) => ({ ...p, sku: e.target.value }))}
          />
        </FormRow>

        <FormRow label="Price (£)" htmlFor="variant-price">
          <input
            id="variant-price"
            type="number"
            step="0.01"
            min="0"
            value={form.price ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              setForm((p) => ({
                ...p,
                price: raw === "" ? undefined : Number(raw),
              }));
            }}
          />
        </FormRow>

        <FormRow label="Stock Quantity" htmlFor="variant-stock">
          <input
            id="variant-stock"
            type="number"
            min="0"
            value={form.stockQuantity ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              setForm((p) => ({
                ...p,
                stockQuantity: raw === "" ? undefined : Number(raw),
              }));
            }}
          />
        </FormRow>

        <FormRow label="Low Stock Alert" htmlFor="variant-low">
          <input
            id="variant-low"
            type="number"
            min="0"
            value={form.lowStockAlert ?? ""}
            onChange={(e) => {
              const raw = e.target.value;
              setForm((p) => ({
                ...p,
                lowStockAlert: raw === "" ? undefined : Number(raw),
              }));
            }}
          />
        </FormRow>

        <FormRow label="Status" htmlFor="variant-status">
          <select
            id="variant-status"
            value={form.status}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                status: e.target.value as VariantStatus,
              }))
            }
          >
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </FormRow>

        <FormSection title="Thumbnail Image">
          <div className={styles.thumbnailUpload}>
            {getImageUrl(form.thumbnailImage) ? (
              <div className={styles.thumbnailPreview}>
                <img
                  src={getImageUrl(form.thumbnailImage)}
                  alt="Variant thumbnail"
                />
                <button
                  type="button"
                  className={styles.removeImageBtn}
                  onClick={() =>
                    setForm((p) => ({
                      ...p,
                      thumbnailImage: {
                        _id: p.thumbnailImage?._id || "",
                        url: "",
                      },
                    }))
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
        </FormSection>
      </FormGrid>

      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          onClick={async () => {
            setIsSaving(true);
            try {
              await onCreate(form);
              onClose();
            } catch {
              // Error toast is handled by onCreate; keep modal open.
            } finally {
              setIsSaving(false);
            }
          }}
          disabled={!canSubmit || isSaving}
        >
          {isSaving ? (
            <Loader2 size={16} className={styles.spinnerIcon} />
          ) : (
            <Plus size={16} />
          )}
          Create
        </Button>
      </ModalFooter>
    </Modal>
  );
};

const VariantEditModal = ({
  isOpen,
  onClose,
  variant,
  onSave,
  canUpdateVariant,
  canUpdateStock,
}: {
  isOpen: boolean;
  onClose: () => void;
  variant: AdminProductVariant | null;
  onSave: (variantId: string, patch: Partial<VariantForm>) => Promise<void>;
  canUpdateVariant: boolean;
  canUpdateStock: boolean;
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [patch, setPatch] = useState<Partial<VariantForm>>({});

  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !variant) return;
    setPatch({
      name: variant.name,
      sku: variant.sku,
      price: variant.price,
      stockQuantity: variant.stockQuantity,
      lowStockAlert: variant.lowStockAlert,
      status: variant.status,
    });
  }, [isOpen, variant]);

  if (!variant) return null;

  const handleThumbnailUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () =>
      setPatch((p) => ({
        ...p,
        thumbnailImage: { _id: "", url: String(reader.result) } as MediaImage,
      }));
    reader.readAsDataURL(file);
  };

  const patchedThumbUrl =
    patch.thumbnailImage !== undefined
      ? getImageUrl(patch.thumbnailImage)
      : null;
  const isThumbnailExplicitlyCleared =
    patch.thumbnailImage !== undefined && patchedThumbUrl === "";

  const thumbnailToShow = isThumbnailExplicitlyCleared
    ? ""
    : patchedThumbUrl || getImageUrl(variant.thumbnailImage);

  const canSave = canUpdateVariant || canUpdateStock;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit Variant" size="lg">
      <FormGrid>
        <FormRow label="Variant Name" htmlFor="edit-variant-name">
          <input
            id="edit-variant-name"
            value={patch.name ?? ""}
            disabled={!canUpdateVariant}
            onChange={(e) => setPatch((p) => ({ ...p, name: e.target.value }))}
          />
        </FormRow>

        <FormRow label="SKU" htmlFor="edit-variant-sku">
          <input
            id="edit-variant-sku"
            value={patch.sku ?? ""}
            disabled={!canUpdateVariant}
            onChange={(e) => setPatch((p) => ({ ...p, sku: e.target.value }))}
          />
        </FormRow>

        <FormRow label="Price (£)" htmlFor="edit-variant-price">
          <input
            id="edit-variant-price"
            type="number"
            step="0.01"
            min="0"
            value={patch.price ?? ""}
            disabled={!canUpdateVariant}
            onChange={(e) => {
              const raw = e.target.value;
              setPatch((p) => ({
                ...p,
                price: raw === "" ? undefined : Number(raw),
              }));
            }}
          />
        </FormRow>

        <FormRow label="Stock Quantity" htmlFor="edit-variant-stock">
          <input
            id="edit-variant-stock"
            type="number"
            min="0"
            value={patch.stockQuantity ?? ""}
            disabled={!canUpdateStock}
            onChange={(e) => {
              const raw = e.target.value;
              setPatch((p) => ({
                ...p,
                stockQuantity: raw === "" ? undefined : Number(raw),
              }));
            }}
          />
        </FormRow>

        <FormRow label="Low Stock Alert" htmlFor="edit-variant-low">
          <input
            id="edit-variant-low"
            type="number"
            min="0"
            value={patch.lowStockAlert ?? ""}
            disabled={!canUpdateStock}
            onChange={(e) => {
              const raw = e.target.value;
              setPatch((p) => ({
                ...p,
                lowStockAlert: raw === "" ? undefined : Number(raw),
              }));
            }}
          />
        </FormRow>

        <FormRow label="Status" htmlFor="edit-variant-status">
          <select
            id="edit-variant-status"
            value={(patch.status as VariantStatus) ?? variant.status}
            disabled={!canUpdateVariant}
            onChange={(e) =>
              setPatch((p) => ({
                ...p,
                status: e.target.value as VariantStatus,
              }))
            }
          >
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
        </FormRow>

        <FormSection title="Thumbnail Image">
          <div className={styles.thumbnailUpload}>
            <div className={styles.thumbnailPreviewArea}>
              <div className={styles.thumbnailPreview}>
                {thumbnailToShow ? (
                  <img src={thumbnailToShow} alt="Variant thumbnail" />
                ) : (
                  <div className={styles.uploadPlaceholder}>
                    <span>No thumbnail</span>
                  </div>
                )}

                {canUpdateVariant ? (
                  patch.thumbnailImage !== undefined ? (
                    <button
                      type="button"
                      className={styles.removeImageBtn}
                      onClick={() =>
                        setPatch((p) => ({ ...p, thumbnailImage: undefined }))
                      }
                      title="Revert"
                    >
                      <X size={14} />
                    </button>
                  ) : getImageUrl(variant.thumbnailImage) ? (
                    <button
                      type="button"
                      className={styles.removeImageBtn}
                      onClick={() =>
                        setPatch((p) => ({
                          ...p,
                          thumbnailImage: { _id: "", url: "" } as MediaImage,
                        }))
                      }
                      title="Remove"
                    >
                      <X size={14} />
                    </button>
                  ) : null
                ) : null}
              </div>

              <div
                className={styles.uploadPlaceholder}
                onClick={() => {
                  if (!canUpdateVariant) return;
                  thumbnailInputRef.current?.click();
                }}
              >
                <span>Click to upload new thumbnail</span>
              </div>
            </div>

            <input
              ref={thumbnailInputRef}
              type="file"
              accept="image/*"
              onChange={handleThumbnailUpload}
              className={styles.hiddenInput}
            />
          </div>
        </FormSection>
      </FormGrid>

      <ModalFooter>
        <Button variant="outline" onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        {canSave ? (
          <Button
            onClick={async () => {
              setIsSaving(true);
              try {
                await onSave(variant._id, patch);
                onClose();
              } catch {
                // Error toast is handled by onSave; keep modal open.
              } finally {
                setIsSaving(false);
              }
            }}
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 size={16} className={styles.spinnerIcon} />
            ) : (
              <Save size={16} />
            )}
            Save
          </Button>
        ) : null}
      </ModalFooter>
    </Modal>
  );
};

const ProductVariantsPage = () => {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();

  const canCreateVariant = hasPermission("variants.create");
  const canUpdateVariant = hasPermission("variants.update");
  const canUpdateStock = hasPermission("stock.update");
  const canEditVariant = canUpdateVariant || canUpdateStock;
  const canDeleteVariant = canUpdateVariant;

  const [isLoading, setIsLoading] = useState(false);
  const [product, setProduct] = useState<AdminProduct | null>(null);
  const [variants, setVariants] = useState<AdminProductVariant[]>([]);
  const [variantStats, setVariantStats] = useState({
    active: 0,
    inactive: 0,
    lowStock: 0,
    outOfStock: 0,
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<
    "active" | "inactive" | "all"
  >("active");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [paginationMeta, setPaginationMeta] = useState<{
    total: number;
    totalPages: number;
    page: number;
    pageSize: number;
  }>({ total: 0, totalPages: 1, page: 1, pageSize: 20 });

  const [paginationAction, setPaginationAction] = useState<
    "prev" | "next" | null
  >(null);
  const [disablingVariantId, setDisablingVariantId] = useState<string | null>(
    null,
  );

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [deletingVariant, setDeletingVariant] =
    useState<AdminProductVariant | null>(null);

  const [selectedVariant, setSelectedVariant] =
    useState<AdminProductVariant | null>(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const pageRef = useRef(page);
  const pageSizeRef = useRef(pageSize);
  const searchRef = useRef(search);
  const statusFilterRef = useRef(statusFilter);

  useEffect(() => {
    pageRef.current = page;
  }, [page]);

  useEffect(() => {
    pageSizeRef.current = pageSize;
  }, [pageSize]);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    statusFilterRef.current = statusFilter;
  }, [statusFilter]);

  const availableByVariantId = useMemo(() => {
    const map: Record<string, number> = {};
    variants.forEach((v) => {
      map[v._id] = (v.stockQuantity || 0) - (v.reservedQuantity || 0);
    });
    return map;
  }, [variants]);

  const refreshProduct = useCallback(
    async (opts?: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: "active" | "inactive" | "all";
    }) => {
      if (!productId) return;
      setIsLoading(true);
      try {
        const targetPage = opts?.page ?? pageRef.current;
        const targetPageSize = opts?.pageSize ?? pageSizeRef.current;
        const targetSearch = opts?.search ?? searchRef.current;
        const targetStatus = opts?.status ?? statusFilterRef.current;

        const [productRes, variantsRes] = await Promise.all([
          api.get(`/admin/products/${productId}`),
          api.get(`/admin/products/${productId}/variants`, {
            params: {
              page: targetPage,
              pageSize: targetPageSize,
              search: targetSearch,
              status: targetStatus,
            },
          }),
        ]);

        const nextProduct = productRes.data?.data?.product as AdminProduct;
        const nextVariants = (variantsRes.data?.data?.variants ||
          []) as AdminProductVariant[];

        const nextStats = variantsRes.data?.data?.stats as
          | {
              active?: number;
              inactive?: number;
              lowStock?: number;
              outOfStock?: number;
            }
          | undefined;

        const nextMeta = (variantsRes.data?.meta || {}) as Partial<
          typeof paginationMeta
        >;

        const nextPage = Number(nextMeta.page ?? targetPage);
        const nextPageSize = Number(nextMeta.pageSize ?? targetPageSize);

        setProduct(nextProduct);
        setVariants(nextVariants);
        if (nextStats) {
          setVariantStats({
            active: Number(nextStats.active || 0),
            inactive: Number(nextStats.inactive || 0),
            lowStock: Number(nextStats.lowStock || 0),
            outOfStock: Number(nextStats.outOfStock || 0),
          });
        }
        setPage(nextPage);
        setPageSize(nextPageSize);
        setPaginationMeta((p) => ({
          total: Number(nextMeta.total ?? p.total ?? 0),
          totalPages: Number(nextMeta.totalPages ?? p.totalPages ?? 1),
          page: nextPage,
          pageSize: nextPageSize,
        }));
      } catch (e: any) {
        showToast({
          type: "error",
          title: "Failed to load product",
          message: e?.response?.data?.message || e?.message,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [productId, showToast],
  );

  useEffect(() => {
    if (!productId) return;
    refreshProduct();
  }, [productId]);

  useEffect(() => {
    if (!isLoading) {
      setPaginationAction(null);
    }
  }, [isLoading]);

  const didMountSearchRef = useRef(false);

  // Match Customers search UX: reset to page 1 when search changes
  useEffect(() => {
    setPage(1);
  }, [search]);

  // Match Customers search UX: debounce API calls while typing
  useEffect(() => {
    if (!productId) return;
    if (!didMountSearchRef.current) {
      didMountSearchRef.current = true;
      return;
    }

    const handle = window.setTimeout(() => {
      const nextSearch = search.trim() || undefined;
      refreshProduct({ page: 1, search: nextSearch });
    }, 250);

    return () => window.clearTimeout(handle);
  }, [productId, refreshProduct, search]);

  const createVariant = async (payload: VariantForm) => {
    if (!productId) return;

    const body = {
      name: payload.name,
      sku: payload.sku,
      price: payload.price,
      stockQuantity: payload.stockQuantity,
      lowStockAlert: payload.lowStockAlert,
      status: payload.status,
      thumbnailImage: payload.thumbnailImage?.url,
    };

    try {
      const res = await api.post(`/admin/products/${productId}/variants`, body);
      showToast({ type: "success", title: "Variant created" });

      // Refresh to ensure latest server state (and any computed fields)
      if (res?.data?.success) {
        setPage(1);
        await refreshProduct({ page: 1 });
      }
    } catch (e: any) {
      const status = e?.response?.status;
      const apiMessage = e?.response?.data?.message;
      const code = e?.response?.data?.error?.code;

      showToast({
        type: "error",
        title:
          status === 409 ? "SKU already exists" : "Failed to create variant",
        message:
          apiMessage ||
          (code === "DUPLICATE_KEY_ERROR"
            ? "SKU already exists"
            : e?.message || "Request failed"),
      });

      // Signal failure to the caller so it doesn't close the modal.
      throw e;
    }
  };

  const updateVariant = async (
    variantId: string,
    patch: Partial<VariantForm>,
  ) => {
    if (!canEditVariant) return;

    const body: Record<string, any> = {
      ...(canUpdateVariant
        ? {
            name: patch.name,
            sku: patch.sku,
            price: patch.price,
            thumbnailImage: patch.thumbnailImage?.url,
            status: patch.status,
          }
        : {}),
      ...(canUpdateStock
        ? {
            stockQuantity: patch.stockQuantity,
            lowStockAlert: patch.lowStockAlert,
          }
        : {}),
    };

    Object.keys(body).forEach((k) => {
      if (body[k] === undefined) delete body[k];
    });

    try {
      const res = await api.put(`/admin/products/variants/${variantId}`, body);
      showToast({ type: "success", title: "Variant updated" });

      if (res?.data?.success) {
        await refreshProduct();
      }
    } catch (e: any) {
      const status = e?.response?.status;
      const apiMessage = e?.response?.data?.message;
      const code = e?.response?.data?.error?.code;

      showToast({
        type: "error",
        title:
          status === 409 ? "SKU already exists" : "Failed to update variant",
        message:
          apiMessage ||
          (code === "DUPLICATE_KEY_ERROR"
            ? "SKU already exists"
            : e?.message || "Request failed"),
      });

      throw e;
    }
  };

  const disableVariant = async (variantId: string) => {
    if (disablingVariantId) return;

    setDisablingVariantId(variantId);
    try {
      const res = await api.delete(`/admin/products/variants/${variantId}`);
      showToast({ type: "success", title: "Variant deleted" });

      if (res?.data?.success) {
        await refreshProduct();
      }
    } catch (e: any) {
      showToast({
        type: "error",
        title: "Failed to delete variant",
        message: e?.response?.data?.message || e?.message,
      });
    } finally {
      setDisablingVariantId(null);
    }
  };

  if (!productId) {
    return (
      <div className={styles.container}>
        <Card className={styles.emptyState}>Missing product id</Card>
      </div>
    );
  }

  const total = paginationMeta.total ?? 0;
  const totalPages = paginationMeta.totalPages ?? 1;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(page * pageSize, total);

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <Button variant="outline" onClick={() => navigate("/products")}>
            <ArrowLeft size={18} /> Back
          </Button>
          <div>
            <h1 className={styles.title}>{product?.name || "Product"}</h1>
            <div className={styles.subtitleRow}>
              <p className={styles.subtitle}>
                {product
                  ? `${product.category} · ${product.slug}`
                  : "Loading..."}
              </p>
              {isLoading ? (
                <span className={styles.inlineLoading}>
                  <Loader2 size={14} className={styles.spinnerIcon} /> Loading…
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {canCreateVariant ? (
          <Button onClick={() => setIsCreateOpen(true)} disabled={isLoading}>
            {isLoading ? (
              <Loader2 size={18} className={styles.spinnerIcon} />
            ) : (
              <Plus size={18} />
            )}
            Add Variant
          </Button>
        ) : null}
      </div>

      <div className={styles.statsGrid}>
        <Card className={styles.statCard}>
          <span className={styles.statLabel}>Active</span>
          <span className={`${styles.statValue} ${styles.success}`}>
            {variantStats.active}
          </span>
        </Card>

        <Card className={styles.statCard}>
          <span className={styles.statLabel}>Inactive</span>
          <span className={styles.statValue}>{variantStats.inactive}</span>
        </Card>

        <Card className={styles.statCard}>
          <span className={styles.statLabel}>Low Stock</span>
          <span className={`${styles.statValue} ${styles.warning}`}>
            {variantStats.lowStock}
          </span>
        </Card>

        <Card className={styles.statCard}>
          <span className={styles.statLabel}>Out of Stock</span>
          <span className={`${styles.statValue} ${styles.danger}`}>
            {variantStats.outOfStock}
          </span>
        </Card>
      </div>

      {product && (
        <Card className={styles.filtersCard}>
          <div className={styles.variantsStats}>
            {/* <div className={styles.variantsFilters}> */}
            <Input
              placeholder="Search variants..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              leftIcon={<Search size={18} />}
              className={styles.searchInput}
            />

            <Select
              className={styles.filterSelect}
              value={statusFilter}
              disabled={isLoading}
              onChange={(v) => {
                const next = v as "active" | "inactive" | "all";
                setStatusFilter(next);
                setPage(1);
                refreshProduct({ page: 1, status: next });
              }}
              options={[
                { value: "active", label: "Active" },
                { value: "inactive", label: "Inactive" },
                { value: "all", label: "All" },
              ]}
            />
          </div>
          {/* </div> */}
        </Card>
      )}

      <Card className={styles.variantsTableCard}>
        <Table className={styles.variantsTableScroll}>
          <TableHeader>
            <TableRow>
              <TableHead>Variant</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Stock</TableHead>
              <TableHead>Reserved</TableHead>
              <TableHead>Available</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className={styles.actionsCell}>Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {variants.map((v) => (
              <TableRow
                key={v._id}
                onClick={
                  isLoading
                    ? undefined
                    : () => {
                        setSelectedVariant(v);
                        if (canEditVariant) {
                          setIsEditOpen(true);
                        } else {
                          setIsViewOpen(true);
                        }
                      }
                }
                className={styles.clickableRow}
              >
                <TableCell>
                  <div className={styles.productCell}>
                    <img
                      src={getImageUrl(v.thumbnailImage)}
                      alt={v.name}
                      className={styles.productImage}
                    />
                    <div className={styles.productInfo}>
                      <span className={styles.productName}>{v.name}</span>
                      <span className={styles.productSku}>{v.sku}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="default">{v.sku}</Badge>
                </TableCell>
                <TableCell>£{Number(v.price || 0).toFixed(2)}</TableCell>
                <TableCell>{v.stockQuantity ?? 0}</TableCell>
                <TableCell>{v.reservedQuantity ?? 0}</TableCell>
                <TableCell>
                  {(() => {
                    const available = availableByVariantId[v._id] ?? 0;
                    const isOutOfStock = available <= 0;
                    const lowAlert = v.lowStockAlert ?? 0;
                    const isLowStock =
                      !isOutOfStock && lowAlert > 0 && available <= lowAlert;

                    return (
                      <div className={styles.badgesCell}>
                        <span>{available}</span>
                        {isLowStock ? (
                          <Badge variant="warning" size="sm">
                            Low
                          </Badge>
                        ) : null}
                        {isOutOfStock ? (
                          <Badge variant="error" size="sm">
                            OOS
                          </Badge>
                        ) : null}
                      </div>
                    );
                  })()}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={v.status === "active" ? "success" : "default"}
                  >
                    {v.status}
                  </Badge>
                </TableCell>

                <TableCell className={styles.actionsCell}>
                  <div className={styles.actions}>
                    {canDeleteVariant ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        isLoading={disablingVariantId === v._id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeletingVariant(v);
                          setIsDeleteOpen(true);
                        }}
                      >
                        <Trash2 size={16} />
                      </Button>
                    ) : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}

            {variants.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={8}
                  align="center"
                  className={styles.tableEmptyCell}
                >
                  {isLoading ? "Loading variants…" : "No variants found"}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>

        <CardFooter className={styles.paginationFooter}>
          <div className={styles.paginationInfo}>
            Showing {rangeStart}–{rangeEnd} of {total}
          </div>

          <div className={styles.paginationControls}>
            <Select
              className={styles.pageSizeSelect}
              value={String(pageSize)}
              disabled={isLoading}
              onChange={(v) => {
                const nextSize = Number(v);
                setPaginationAction(null);
                setPageSize(nextSize);
                setPage(1);
                refreshProduct({ page: 1, pageSize: nextSize });
              }}
              options={[
                { value: "10", label: "10 / page" },
                { value: "20", label: "20 / page" },
                { value: "50", label: "50 / page" },
              ]}
            />

            <div className={styles.pageButtons}>
              <Button
                variant="outline"
                size="sm"
                disabled={isLoading || page <= 1}
                onClick={() => {
                  setPaginationAction("prev");
                  const nextPage = Math.max(1, page - 1);
                  setPage(nextPage);
                  refreshProduct({ page: nextPage });
                }}
              >
                {isLoading && paginationAction === "prev" ? (
                  <Loader2 size={14} className={styles.spinnerIcon} />
                ) : (
                  <>
                    <ChevronLeft size={16} />
                    Prev
                  </>
                )}
              </Button>

              <div className={styles.pageLabel}>
                Page {page} / {totalPages}
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={isLoading || page >= totalPages}
                onClick={() => {
                  setPaginationAction("next");
                  const nextPage = Math.min(totalPages, page + 1);
                  setPage(nextPage);
                  refreshProduct({ page: nextPage });
                }}
              >
                {isLoading && paginationAction === "next" ? (
                  <Loader2 size={14} className={styles.spinnerIcon} />
                ) : (
                  <>
                    Next
                    <ChevronRight size={16} />
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardFooter>
      </Card>

      <VariantViewModal
        isOpen={isViewOpen}
        onClose={() => setIsViewOpen(false)}
        variant={selectedVariant}
      />

      <VariantCreateModal
        isOpen={canCreateVariant ? isCreateOpen : false}
        onClose={() => setIsCreateOpen(false)}
        onCreate={createVariant}
      />

      <VariantEditModal
        isOpen={canEditVariant ? isEditOpen : false}
        onClose={() => setIsEditOpen(false)}
        variant={selectedVariant}
        onSave={updateVariant}
        canUpdateVariant={canUpdateVariant}
        canUpdateStock={canUpdateStock}
      />

      <VariantDeleteModal
        isOpen={canDeleteVariant ? isDeleteOpen : false}
        onClose={() => setIsDeleteOpen(false)}
        variant={
          deletingVariant
            ? { _id: deletingVariant._id, name: deletingVariant.name }
            : null
        }
        onConfirm={disableVariant}
        isDeleting={Boolean(
          disablingVariantId && deletingVariant?._id === disablingVariantId,
        )}
        canDelete={canDeleteVariant}
      />
    </div>
  );
};

export default ProductVariantsPage;
