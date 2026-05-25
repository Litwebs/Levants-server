import api from "@/context/api";
import type {
  Category,
  CreateCategoryBody,
  ListCategoriesMeta,
  UpdateCategoryBody,
} from "./types";

type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  message?: string;
  meta?: ListCategoriesMeta;
};

const unwrap = <T,>(payload: unknown): T | null => {
  if (!payload || typeof payload !== "object") return null;
  const env = payload as ApiEnvelope<T>;
  if ("data" in env) return (env.data ?? null) as T | null;
  return payload as T;
};

export async function listCategories(params?: {
  page?: number;
  pageSize?: number;
}) {
  const res = await api.get("/admin/categories", { params });
  const data = unwrap<{ categories: Category[] }>(res.data);
  const categories = data?.categories ?? [];
  const meta = (res.data as ApiEnvelope<any>)?.meta;
  return { categories, meta };
}

export async function createCategory(body: CreateCategoryBody) {
  const res = await api.post("/admin/categories", body);
  const data = unwrap<{ category: Category }>(res.data);
  if (!data?.category) throw new Error("Failed to create category");
  return data.category;
}

export async function updateCategory(
  categoryId: string,
  body: UpdateCategoryBody,
) {
  const res = await api.patch(`/admin/categories/${categoryId}`, body);
  const data = unwrap<{ category: Category }>(res.data);
  if (!data?.category) throw new Error("Failed to update category");
  return data.category;
}

export async function deleteCategory(categoryId: string) {
  const res = await api.delete(`/admin/categories/${categoryId}`);
  const data = unwrap<{ category: Category }>(res.data);
  if (!data?.category) throw new Error("Failed to delete category");
  return data.category;
}
