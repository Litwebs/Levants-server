import { useCallback, useEffect, useState } from "react";
import type {
  Category,
  CreateCategoryBody,
  ListCategoriesMeta,
  UpdateCategoryBody,
} from "@/context/Categories";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "@/context/Categories";

type State = {
  categories: Category[];
  meta: ListCategoriesMeta | null;
  loading: boolean;
  error: string | null;
  creating: boolean;
  deletingId: string | null;
  updatingId: string | null;
};

export function useCategories(initial?: { page?: number; pageSize?: number }) {
  const [page, setPage] = useState<number>(initial?.page ?? 1);
  const [pageSize] = useState<number>(initial?.pageSize ?? 50);

  const [state, setState] = useState<State>({
    categories: [],
    meta: null,
    loading: true,
    error: null,
    creating: false,
    deletingId: null,
    updatingId: null,
  });

  const fetch = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await listCategories({ page, pageSize });
      setState((s) => ({
        ...s,
        categories: res.categories,
        meta: res.meta ?? null,
        loading: false,
      }));
    } catch (err: any) {
      setState((s) => ({
        ...s,
        loading: false,
        error:
          err?.response?.data?.message ||
          err?.message ||
          "Failed to load categories",
      }));
    }
  }, [page, pageSize]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  const handleCreate = useCallback(
    async (body: CreateCategoryBody) => {
      setState((s) => ({ ...s, creating: true }));
      try {
        await createCategory(body);
        await fetch();
        setState((s) => ({ ...s, creating: false }));
      } catch (err: any) {
        setState((s) => ({ ...s, creating: false }));
        throw err;
      }
    },
    [fetch],
  );

  const handleUpdate = useCallback(
    async (categoryId: string, body: UpdateCategoryBody) => {
      setState((s) => ({ ...s, updatingId: categoryId }));
      try {
        await updateCategory(categoryId, body);
        await fetch();
      } finally {
        setState((s) => ({ ...s, updatingId: null }));
      }
    },
    [fetch],
  );

  const handleDelete = useCallback(
    async (categoryId: string) => {
      setState((s) => ({ ...s, deletingId: categoryId }));
      try {
        await deleteCategory(categoryId);
        await fetch();
      } finally {
        setState((s) => ({ ...s, deletingId: null }));
      }
    },
    [fetch],
  );

  return {
    ...state,
    page,
    pageSize,
    totalPages: state.meta?.totalPages ?? 1,
    setPage,
    create: handleCreate,
    update: handleUpdate,
    remove: handleDelete,
  };
}
