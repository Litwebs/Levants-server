import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CreateDiscountBody, Discount, ListDiscountsMeta } from "@/context/Discounts";
import {
  createDiscount,
  deactivateDiscount,
  listDiscounts,
} from "@/context/Discounts";

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
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatusValue] = useState<"all" | "active" | "inactive">("all");
  const [kind, setKindValue] = useState<"all" | "percent" | "amount">("all");
  const [scope, setScopeValue] = useState<"all" | "global" | "category" | "variant">("all");
  const [sort, setSortValue] = useState<"newest" | "oldest" | "name" | "code">("newest");
  const requestId = useRef(0);
  useEffect(() => {
    const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const [state, setState] = useState<State>({
    discounts: [],
    meta: null,
    loading: true,
    error: null,
    creating: false,
    deletingId: null,
  });

  const fetchDiscounts = useCallback(async () => {
    const current = ++requestId.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await listDiscounts({ page, pageSize, search: query || undefined, status, kind, scope, sort });
      if (current !== requestId.current) return;
      setState((s) => ({
        ...s,
        discounts: res.discounts,
        meta: res.meta ?? null,
        loading: false,
      }));
    } catch (err: any) {
      if (current !== requestId.current) return;
      setState((s) => ({
        ...s,
        loading: false,
        error: err?.response?.data?.message || err?.message || "Failed to load discounts",
      }));
    }
  }, [page, pageSize, query, status, kind, scope, sort]);

  useEffect(() => {
    void fetchDiscounts();
    return () => { requestId.current += 1; };
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
    search, setSearch, status, kind, scope, sort,
    setStatus: (value: typeof status) => { setStatusValue(value); setPage(1); },
    setKind: (value: typeof kind) => { setKindValue(value); setPage(1); },
    setScope: (value: typeof scope) => { setScopeValue(value); setPage(1); },
    setSort: (value: typeof sort) => { setSortValue(value); setPage(1); },
    refetch: fetchDiscounts,
    create: handleCreate,
    deactivate: handleDeactivate,
  };
}
