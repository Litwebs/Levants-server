import { useCallback, useEffect, useMemo, useState } from "react";
import type { CreateDiscountBody, Discount, ListDiscountsMeta } from "../types";
import {
  createDiscount,
  deactivateDiscount,
  listDiscounts,
} from "../api/discountsAdminApi";

type State = {
  discounts: Discount[];
  meta: ListDiscountsMeta | null;
  loading: boolean;
  error: string | null;
  creating: boolean;
  deletingId: string | null;
};

export function useDiscountsAdmin(initial?: { page?: number; pageSize?: number }) {
  const [page, setPage] = useState<number>(initial?.page ?? 1);
  const [pageSize, setPageSize] = useState<number>(initial?.pageSize ?? 20);

  const [state, setState] = useState<State>({
    discounts: [],
    meta: null,
    loading: true,
    error: null,
    creating: false,
    deletingId: null,
  });

  const fetchDiscounts = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await listDiscounts({ page, pageSize });
      setState((s) => ({
        ...s,
        discounts: res.discounts,
        meta: res.meta ?? null,
        loading: false,
      }));
    } catch (err: any) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err?.response?.data?.message || err?.message || "Failed to load discounts",
      }));
    }
  }, [page, pageSize]);

  useEffect(() => {
    void fetchDiscounts();
  }, [fetchDiscounts]);

  const handleCreate = useCallback(
    async (body: CreateDiscountBody) => {
      setState((s) => ({ ...s, creating: true }));
      try {
        await createDiscount(body);
        await fetchDiscounts();
        setState((s) => ({ ...s, creating: false }));
        return true;
      } catch (err: any) {
        setState((s) => ({ ...s, creating: false }));
        throw err;
      }
    },
    [fetchDiscounts],
  );

  const handleDeactivate = useCallback(
    async (discountId: string) => {
      setState((s) => ({ ...s, deletingId: discountId }));
      try {
        await deactivateDiscount(discountId);
        await fetchDiscounts();
      } finally {
        setState((s) => ({ ...s, deletingId: null }));
      }
    },
    [fetchDiscounts],
  );

  const totalPages = useMemo(() => state.meta?.totalPages ?? 1, [state.meta]);

  return {
    ...state,
    page,
    pageSize,
    totalPages,
    setPage,
    setPageSize,
    refetch: fetchDiscounts,
    create: handleCreate,
    deactivate: handleDeactivate,
  };
}
