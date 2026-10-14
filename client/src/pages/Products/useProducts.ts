import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useToast } from '../../components/common/Toast';
import api from "../../context/api";
import { AdminProduct } from "./types";
import { getImageUrl, getImageUrls } from "./product.utils";
import { useNavigate } from "react-router-dom";

export function useProducts() {
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [apiCategories, setApiCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [sortBy, setSortBy] = useState("newest");
  const [variantStockFilter, setVariantStockFilter] = useState<
    "All" | "low" | "out"
  >("All");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    lowStock: 0,
    outOfStock: 0,
  });
  const [paginationMeta, setPaginationMeta] = useState({
    total: 0,
    totalPages: 1,
  });

  const [selectedProduct, setSelectedProduct] = useState<AdminProduct | null>(
    null,
  );
  const [editForm, setEditForm] = useState<Partial<AdminProduct>>({});

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [productImages, setProductImages] = useState({
    thumbnail: '',
    gallery: [] as string[],
  });

  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery.trim());
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedCategory, selectedStatus, variantStockFilter, sortBy]);

  const fetchProducts = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    try {
      const res = await api.get("/admin/products", {
        params: {
          page,
          pageSize,
          search: debouncedSearchQuery || undefined,
          category: selectedCategory === "All" ? undefined : selectedCategory,
          status: selectedStatus === "All" ? undefined : selectedStatus,
          stock: variantStockFilter === "All" ? undefined : variantStockFilter,
          sort: sortBy,
        },
      });

      if (requestId !== requestIdRef.current) return;

      const next = (res.data?.data?.products || []) as AdminProduct[];
      const meta = res.data?.meta || {};
      setProducts(next);
      setApiCategories((meta.categories || []) as string[]);
      setStats({
        total: Number(meta.stats?.total) || 0,
        active: Number(meta.stats?.active) || 0,
        lowStock: Number(meta.stats?.lowStock) || 0,
        outOfStock: Number(meta.stats?.outOfStock) || 0,
      });
      setPaginationMeta({
        total: Number(meta.total) || 0,
        totalPages: Math.max(1, Number(meta.totalPages) || 1),
      });
    } catch (e: any) {
      if (requestId !== requestIdRef.current) return;
      showToast({
        type: "error",
        title: "Failed to load products",
        message: e?.response?.data?.message || e?.message,
      });
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [
    debouncedSearchQuery,
    page,
    pageSize,
    selectedCategory,
    selectedStatus,
    showToast,
    sortBy,
    variantStockFilter,
  ]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchProducts();
    })();

    return () => {
      cancelled = true;
    };
  }, [fetchProducts]);

  const categoryOptions = useMemo(
    () => ["All", ...apiCategories],
    [apiCategories],
  );

  // These aliases preserve the table interface while making it explicit that
  // the returned collection is already filtered, sorted, and paginated.
  const filteredProducts = products;
  const pagedProducts = products;

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), paginationMeta.totalPages));
  }, [paginationMeta.totalPages]);

  const productVariantCounts = useMemo(() => {
    const map: Record<string, { total: number; low: number; out: number }> =
      {};

    products.forEach((p) => {
      const variants = Array.isArray(p.variants) ? p.variants : [];
      const active = variants.filter((v) => v.status === "active");

      const out = active.filter((v) => {
        const available = (v.stockQuantity || 0) - (v.reservedQuantity || 0);
        return available <= 0;
      }).length;
      const low = active.filter((v) => {
        const available = (v.stockQuantity || 0) - (v.reservedQuantity || 0);
        const threshold = v.lowStockAlert ?? 0;
        return threshold > 0 && available > 0 && available <= threshold;
      }).length;

      map[p._id] = { total: variants.length, low, out };
    });

    return map;
  }, [products]);

  const handleThumbnailUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () =>
      setProductImages((p) => ({ ...p, thumbnail: String(reader.result) }));
    reader.readAsDataURL(file);
  };

  const handleGalleryUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () =>
        setProductImages((p) => {
          const next = [...p.gallery, String(reader.result)].slice(0, 10);
          return { ...p, gallery: next };
        });
      reader.readAsDataURL(file);
    });
  };

  const handleRemoveThumbnail = () =>
    setProductImages((p) => ({ ...p, thumbnail: "" }));

  const handleRemoveGalleryImage = (index: number) =>
    setProductImages((p) => ({
      ...p,
      gallery: p.gallery.filter((_, i) => i !== index),
    }));

  const handleEditProduct = (product: AdminProduct) => {
    navigate(`/products/${product._id}/edit`, { state: { product } });
  };

  const handleSaveEdit = async () => {
    if (!selectedProduct?._id) return;
    if (isSaving) return;

    setIsSaving(true);
    try {
      const thumbnailDraft = productImages.thumbnail;
      const isThumbnailCleared = thumbnailDraft === "";
      const isThumbnailBase64 =
        typeof thumbnailDraft === "string" && thumbnailDraft.startsWith("data:");

      const payload: Record<string, any> = {
        name: editForm.name,
        category: editForm.category,
        description: editForm.description,
        status: editForm.status,
        allergens: editForm.allergens,
        storageNotes: editForm.storageNotes ?? "",
        ...(isThumbnailCleared
          ? { thumbnailImage: "" }
          : isThumbnailBase64
            ? { thumbnailImage: thumbnailDraft }
            : {}),
        galleryImages: productImages.gallery,
      };

      // drop undefined keys (server requires min(1))
      Object.keys(payload).forEach((k) => {
        if (payload[k] === undefined) delete payload[k];
      });

      const res = await api.put(
        `/admin/products/${selectedProduct._id}`,
        payload,
      );

      const updated = res.data?.data?.product as AdminProduct;
      setProducts((prev) =>
        prev.map((p) => (p._id === updated._id ? { ...p, ...updated } : p)),
      );
      setSelectedProduct((p) => (p?._id === updated._id ? { ...p, ...updated } : p));

      // keep images in sync with returned shape
      setProductImages({
        thumbnail: getImageUrl(updated.thumbnailImage),
        gallery: getImageUrls(updated.galleryImages),
      });

      showToast({ type: "success", title: "Product updated" });
      setIsEditModalOpen(false);

      // Refresh list to ensure we have latest populated file objects
      await fetchProducts();
    } catch (e: any) {
      showToast({
        type: "error",
        title: "Failed to update product",
        message: e?.response?.data?.message || e?.message,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveProduct = async (product: AdminProduct) => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      const res = await api.delete(`/admin/products/${product._id}`);
      const archived = res.data?.data?.product as AdminProduct;
      setProducts((prev) =>
        prev.map((p) => (p._id === archived._id ? { ...p, ...archived } : p)),
      );
      showToast({ type: "success", title: "Product archived" });

      // Refresh list to keep status/variants in sync
      await fetchProducts();
    } catch (e: any) {
      showToast({
        type: "error",
        title: "Failed to archive product",
        message: e?.response?.data?.message || e?.message,
      });
    } finally {
      setIsSaving(false);
    }
  };


  return {
    products,
    setProducts,

    isLoading,
    isSaving,
    fetchProducts,

    stats,
    filteredProducts,
    pagedProducts,
    productVariantCounts,

    page,
    setPage,
    pageSize,
    setPageSize,
    paginationMeta,

    categoryOptions,
    apiCategories,

    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedStatus,
    setSelectedStatus,
    sortBy,
    setSortBy,

    variantStockFilter,
    setVariantStockFilter,

    selectedProduct,
    setSelectedProduct,
    editForm,
    setEditForm,

    isViewModalOpen,
    setIsViewModalOpen,
    isEditModalOpen,
    setIsEditModalOpen,
    isDeleteModalOpen,
    setIsDeleteModalOpen,

    productImages,
    setProductImages,
    thumbnailInputRef,
    galleryInputRef,

    handleThumbnailUpload,
    handleGalleryUpload,
    handleRemoveThumbnail,
    handleRemoveGalleryImage,

    handleEditProduct,
    handleSaveEdit,
    handleArchiveProduct,

    showToast,
  };
}
