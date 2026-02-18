import api from "@/context/api";

export type VariantSearchItem = {
  _id: string;
  name: string;
  sku: string;
  status?: "active" | "inactive" | string;
  product?: { name: string } | null;
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

export async function searchVariants(params: { q: string; limit?: number }) {
  const res = await api.get("/admin/variants/search", { params });
  const data = unwrapData<{ variants: VariantSearchItem[] }>(res.data);
  return data?.variants ?? [];
}
