export type ProductStatus = "active" | "draft" | "archived";
export type VariantStatus = "active" | "inactive";

export type MediaImage = {
  _id: string;
  url: string;
  originalName?: string;
  filename?: string;
  mimeType?: string;
  sizeBytes?: number;
  isArchived?: boolean;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type AdminProductVariant = {
  _id: string;
  product: string;
  name: string;
  sku: string;
  price: number;
  stockQuantity: number;
  reservedQuantity: number;
  lowStockAlert: number;
  status: VariantStatus;
  thumbnailImage: string | MediaImage;
  createdAt: string;
  updatedAt: string;
};

export type AdminProduct = {
  _id: string;
  name: string;
  slug: string;
  category: string;
  description: string;
  status: ProductStatus;
  allergens: string[];
  storageNotes: string | null;
  thumbnailImage: string | MediaImage;
  galleryImages: Array<string | MediaImage>;
  createdAt: string;
  updatedAt: string;
  variants?: AdminProductVariant[];
};
