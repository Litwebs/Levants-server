import api from "@/context/api";

export type VariantSearchItem = {
  _id: string;
  name: string;
  sku: string;
  price?: number;
  status?: "active" | "inactive" | string;
  stockQuantity?: number;
  reservedQuantity?: number;
  availableQuantity?: number;
  thumbnailImage?: { url?: string } | null;
  product?: {
    name: string;
    category?: string;
    status?: string;
    thumbnailImage?: { url?: string } | null;
  } | null;
};

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  message?: string;
};

const unwrapData = <T,>(payload: unknown): T | null => {
  if (!payload || typeof payload !== "object") return null;
  const maybeEnvelope = payload as ApiEnvelope<T>;
  if ("data" in maybeEnvelope) return (maybeEnvelope.data ?? null) as T | null;
  return payload as T;
};

export type VariantSearchPagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export async function searchVariants(params: { q?: string; page?: number; pageSize?: number; inStock?: boolean }) {
  const res = await api.get("/admin/variants/search", { params });
  const data = unwrapData<{ variants: VariantSearchItem[]; pagination?: VariantSearchPagination }>(res.data);
  return {
    variants: data?.variants ?? [],
    pagination: data?.pagination ?? { page: 1, pageSize: params.pageSize ?? 8, total: 0, totalPages: 1 },
  };
}
