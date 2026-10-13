
export type DealCatalogVariant = {
  _id: string;
  name: string;
  sku: string;
  price?: number;
  status?: "active" | "inactive" | string;
  stockQuantity?: number;
  reservedQuantity?: number;
  availableQuantity?: number;
  thumbnailImage?: { url?: string } | null;
  product?: { name: string; category?: string; status?: string; thumbnailImage?: { url?: string } | null } | null;
};

