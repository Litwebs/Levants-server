export type DealItem = {
  variantId: string;
  quantity: number;
  variant?: {
    _id: string;
    name: string;
    sku: string;
    price: number;
    stockQuantity?: number;
    reservedQuantity?: number;
    thumbnailImage?: { url?: string } | null;
  } | null;
  product?: {
    _id: string;
    name: string;
    category?: string;
    thumbnailImage?: { url?: string } | null;
  } | null;
};

export type Deal = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  imageUrl?: string;
  items: DealItem[];
  packagePrice: number;
  currency?: string;
  isActive: boolean;
  isFeatured: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  sortOrder?: number;
  originalValue?: number;
  savings?: number;
  savingsPercent?: number;
  maxPackages?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type DealDraft = {
  name: string;
  slug?: string;
  description?: string;
  imageUrl?: string;
  items: Array<{ variantId: string; quantity: number }>;
  packagePrice: number;
  currency?: string;
  isActive?: boolean;
  isFeatured?: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  sortOrder?: number;
};

export type DealsMeta = {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
