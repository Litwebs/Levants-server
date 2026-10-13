import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  CircleAlert,
  CircleCheck,
  CircleMinus,
  CircleX,
  ChevronRight,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";

import api from "../../context/api";
import {
  Badge,
  Button,
  Card,
  DataTableCard,
  FiltersCardLayout,
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
  PageContainer,
} from "../../components/common";
import { useToast } from "../../components/common/Toast";
import { usePermissions } from "@/hooks/usePermissions";

import styles from "./Products.module.css";
import sharedFilterStyles from "../../components/common/FiltersCardLayout/SharedFilters.module.css";
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
  description: string;
  ingredients: string;
  allergens: string;
  nutritionalInformation: string;
  sku: string;
  price: number | undefined;
  stockQuantity: number | undefined;
  lowStockAlert: number | undefined;
  status: VariantStatus;
  thumbnailImage: MediaImage;
};

const emptyCreateForm = (): VariantForm => ({
  name: "",
  description: "",
  ingredients: "",
  allergens: "",
  nutritionalInformation: "",
  sku: "",
  price: 0,
  stockQuantity: 0,
  lowStockAlert: 5,
  status: "active",
  thumbnailImage: { _id: "", url: "" },
});

const parseAllergens = (value: string) =>
  value
    .split(",")
    .map((allergen) => allergen.trim())
    .filter(Boolean);

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

        <FormSection title="Product Information">
          <FormGrid>
            <FormValue label="Description" value={variant.description} />
            <FormValue label="Ingredients" value={variant.ingredients} />
            <FormValue
              label="Allergens"
              value={
                variant.allergens === undefined
                  ? "Uses product default"
                  : variant.allergens.join(", ") || "None"
              }
            />
            <FormValue
              label="Nutritional Information"
              value={variant.nutritionalInformation}
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

        <FormSection title="Product Information">
          <FormGrid>
            <FormRow label="Description" htmlFor="variant-description">
              <textarea
                id="variant-description"
                rows={3}
                value={form.description}
                onChange={(e) =>
                  setForm((p) => ({ ...p, description: e.target.value }))
                }
                placeholder="Description shown for this variant"
              />
            </FormRow>

            <FormRow label="Ingredients" htmlFor="variant-ingredients">
              <textarea
                id="variant-ingredients"
                rows={3}
                value={form.ingredients}
                onChange={(e) =>
                  setForm((p) => ({ ...p, ingredients: e.target.value }))
                }
                placeholder="Ingredients for this variant"
              />
            </FormRow>

            <FormRow label="Allergens" htmlFor="variant-allergens">
              <input
                id="variant-allergens"
                value={form.allergens}
                onChange={(e) =>
                  setForm((p) => ({ ...p, allergens: e.target.value }))
                }
                placeholder="Comma-separated (e.g. Milk, Nuts)"
              />
            </FormRow>

            <FormRow
              label="Nutritional Information"
              htmlFor="variant-nutrition"
            >
              <textarea
                id="variant-nutrition"
                rows={5}
                value={form.nutritionalInformation}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    nutritionalInformation: e.target.value,
                  }))
                }
                placeholder="Nutritional information for this variant"
              />
            </FormRow>
          </FormGrid>
        </FormSection>

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
      description: payload.description,
      ingredients: payload.ingredients,
      allergens: parseAllergens(payload.allergens),
      nutritionalInformation: payload.nutritionalInformation,
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
  return (
    <PageContainer className={`${styles.container} ${styles.variantsPage}`}>
      <nav aria-label="Breadcrumb" className={styles.variantsBreadcrumb}>
        <Link to="/products">Products</Link>
        <ChevronRight size={14} aria-hidden="true" />
        <Link to={`/products/${productId}/edit`}>{product?.name || "Product"}</Link>
      </nav>
      <div className={styles.header}>
        <div className={styles.titleSection}>
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

        <div className={styles.headerActions}>
          <Button variant="outline" size="sm" leftIcon={<RefreshCw size={16} />} onClick={() => void refreshProduct()} disabled={isLoading}>Refresh</Button>
        </div>
      </div>

      <Card padding="none" className={styles.catalogStats}>
        <dl className={styles.catalogStatsList} aria-label="Variant overview">
          {[
            { label: "Active", value: variantStats.active, description: "Available for sale", icon: <CircleCheck size={19} />, tone: styles.successIcon },
            { label: "Inactive", value: variantStats.inactive, description: "Hidden from sale", icon: <CircleMinus size={19} />, tone: "" },
            { label: "Low stock", value: variantStats.lowStock, description: "Needs attention", icon: <CircleAlert size={19} />, tone: styles.warningIcon },
            { label: "Out of stock", value: variantStats.outOfStock, description: "Currently unavailable", icon: <CircleX size={19} />, tone: styles.dangerIcon },
          ].map((item) => (
            <div className={styles.catalogStatItem} key={item.label}>
              <span className={`${styles.statIcon} ${item.tone}`} aria-hidden="true">{item.icon}</span>
              <div className={styles.statContent}>
                <dt className={styles.statLabel}>{item.label}</dt>
                <dd className={styles.statDetail}>
                  <span className={styles.statValue}>{item.value}</span>
                  <span className={styles.statDescription}>{item.description}</span>
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </Card>

      {product && (
        <FiltersCardLayout className={sharedFilterStyles.filtersCard} topRow={
          <div className={sharedFilterStyles.searchRow}>
            <div className={sharedFilterStyles.searchInput}>
            <Input
              aria-label="Search variants"
              placeholder="Search variants..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              leftIcon={<Search size={18} />}
              className={sharedFilterStyles.searchControl}
            />
            </div>

            <Select
              aria-label="Filter variants by status"
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
            {canCreateVariant ? (
              <Button size="sm" leftIcon={<Plus size={16} />} onClick={() => setIsCreateOpen(true)} disabled={isLoading}>Add Variant</Button>
            ) : null}
          </div>
        } />
      )}

      <DataTableCard
        className={styles.productsTableCard}
        loading={isLoading}
        loadingText="Loading variants…"
        pagination={{
          page, pageSize, total, totalPages,
          setPage: (next) => {
            const nextPage = typeof next === "function" ? next(page) : next;
            setPage(nextPage);
            refreshProduct({ page: nextPage });
          },
          setPageSize: (nextSize) => {
            setPageSize(nextSize);
            setPage(1);
            refreshProduct({ page: 1, pageSize: nextSize });
          },
          pageSizeOptions: [
            { value: "10", label: "10 / page" },
            { value: "20", label: "20 / page" },
            { value: "50", label: "50 / page" },
          ],
          loading: isLoading,
          footerClassName: styles.productsPagination,
        }}
      >
        <Table withWrapper={false} tableClassName={styles.responsiveVariantsTable}>
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
                          navigate(`/products/${productId}/variants/${v._id}/edit`);
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

      </DataTableCard>

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
    </PageContainer>
  );
};

export default ProductVariantsPage;
