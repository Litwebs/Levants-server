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

export function useProducts() {
  const { showToast } = useToast();

  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [variantStockFilter, setVariantStockFilter] = useState<
    "All" | "low" | "out"
  >("All");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [selectedProduct, setSelectedProduct] = useState<AdminProduct | null>(
    null,
  );
  const [editForm, setEditForm] = useState<Partial<AdminProduct>>({});

  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const [productImages, setProductImages] = useState({
    thumbnail: '',
    gallery: [] as string[],
  });

  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const fetchProducts = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get("/admin/products", {
        params: { page: 1, pageSize: 100 },
      });

      const next = (res.data?.data?.products || []) as AdminProduct[];
      setProducts(next);
    } catch (e: any) {
      showToast({
        type: "error",
        title: "Failed to load products",
        message: e?.response?.data?.message || e?.message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

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

  const stats = useMemo(() => {
    const active = products.filter((p) => p.status === "active").length;

    const lowStock = products.filter((p) => {
      const variants = (p.variants || []).filter((v) => v.status === "active");
      if (variants.length === 0) return false;

      return variants.some((v) => {
        const available = (v.stockQuantity || 0) - (v.reservedQuantity || 0);
        const threshold = v.lowStockAlert ?? 0;
        return threshold > 0 && available > 0 && available <= threshold;
      });
    }).length;

    const outOfStock = products.filter((p) => {
      const variants = (p.variants || []).filter((v) => v.status === "active");
      // For dashboard-style visibility, treat a product as "out of stock"
      // if it has no active variants OR any active variant is out of stock.
      if (variants.length === 0) return true;
      return variants.some((v) => {
        const available = (v.stockQuantity || 0) - (v.reservedQuantity || 0);
        return available <= 0;
      });
    }).length;

    return { total: products.length, active, lowStock, outOfStock };
  }, [products]);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesSearch =
        product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.slug.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory =
        selectedCategory === "All" || product.category === selectedCategory;
      const matchesStatus =
        selectedStatus === "All" || product.status === selectedStatus;

      const activeVariants = (product.variants || []).filter(
        (v) => v.status === "active",
      );
      const outOfStockCount = activeVariants.filter((v) => {
        const available = (v.stockQuantity || 0) - (v.reservedQuantity || 0);
        return available <= 0;
      }).length;
      const lowStockCount = activeVariants.filter((v) => {
        const available = (v.stockQuantity || 0) - (v.reservedQuantity || 0);
        const threshold = v.lowStockAlert ?? 0;
        return threshold > 0 && available > 0 && available <= threshold;
      }).length;
      const isOutOfStock = activeVariants.length === 0 || outOfStockCount > 0;

      const matchesVariantStock =
        variantStockFilter === "All" ||
        (variantStockFilter === "low" && lowStockCount > 0) ||
        (variantStockFilter === "out" && isOutOfStock);

      return (
        matchesSearch &&
        matchesCategory &&
        matchesStatus &&
        matchesVariantStock
      );
    });
  }, [products, searchQuery, selectedCategory, selectedStatus, variantStockFilter]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedCategory, selectedStatus, variantStockFilter]);

  const paginationMeta = useMemo(() => {
    const total = filteredProducts.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return { total, totalPages };
  }, [filteredProducts.length, pageSize]);

  useEffect(() => {
    setPage((p) => Math.min(Math.max(1, p), paginationMeta.totalPages));
  }, [paginationMeta.totalPages]);

  const pagedProducts = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return filteredProducts.slice(start, end);
  }, [filteredProducts, page, pageSize]);

  const productVariantCounts = useMemo(() => {
    const map: Record<string, { total: number; low: number; out: number }> =
      {};

    filteredProducts.forEach((p) => {
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
  }, [filteredProducts]);

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
    setSelectedProduct(product);
    setEditForm({
      _id: product._id,
      name: product.name,
      category: product.category,
      description: product.description,
      status: product.status,
      allergens: product.allergens,
      storageNotes: product.storageNotes,
      thumbnailImage: product.thumbnailImage,
      galleryImages: product.galleryImages,
    });
    setProductImages({
      thumbnail: getImageUrl(product.thumbnailImage),
      gallery: getImageUrls(product.galleryImages),
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedProduct?._id) return;
    if (isSaving) return;

    setIsSaving(true);
    try {
      const resolvedThumbnail =
        productImages.thumbnail || getImageUrl(editForm.thumbnailImage);

      const payload: Record<string, any> = {
        name: editForm.name,
        category: editForm.category,
        description: editForm.description,
        status: editForm.status,
        allergens: editForm.allergens,
        storageNotes: editForm.storageNotes ?? "",
        thumbnailImage: resolvedThumbnail,
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

  const handleCreateProduct = () => {
    setSelectedProduct(null);
    setEditForm({ status: "draft", allergens: [], storageNotes: "" });
    setProductImages({ thumbnail: "", gallery: [] });
    setIsCreateModalOpen(true);
  };

  const handleCreate = async () => {
    if (isSaving) return;

    setIsSaving(true);
    try {
      const payload: Record<string, any> = {
        name: editForm.name,
        category: editForm.category,
        description: editForm.description,
        status: editForm.status || "draft",
        allergens: editForm.allergens || [],
        storageNotes: editForm.storageNotes ?? "",
        thumbnailImage: productImages.thumbnail,
        galleryImages: productImages.gallery,
      };

      const res = await api.post("/admin/products", payload);
      const created = res.data?.data?.product as AdminProduct;
      setProducts((prev) => [created, ...prev]);

      showToast({ type: "success", title: "Product created" });
      setIsCreateModalOpen(false);

      // Refresh list so images/variants are populated consistently
      await fetchProducts();
    } catch (e: any) {
      showToast({
        type: "error",
        title: "Failed to create product",
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

    searchQuery,
    setSearchQuery,
    selectedCategory,
    setSelectedCategory,
    selectedStatus,
    setSelectedStatus,

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
    isCreateModalOpen,
    setIsCreateModalOpen,
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
    handleCreateProduct,
    handleCreate,
    handleArchiveProduct,

    showToast,
  };
}
