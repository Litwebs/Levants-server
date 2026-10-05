import { useEffect, useState } from "react";
import api from "@/context/api";
import type { VariantSearchItem } from "@/context/Discounts";

export function useDealCatalog() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [inStock, setInStock] = useState(false);
  const [results, setResults] = useState<VariantSearchItem[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 8,
    total: 0,
    totalPages: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get("/admin/deals/catalog", {
          params: { q: query, page, pageSize, inStock },
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setResults(res.data.data.variants);
        setPagination(res.data.data.pagination);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        setResults([]);
        setError(
          err instanceof Error ? err.message : "Unable to load products",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, page, pageSize, inStock]);
  return {
    query,
    setQuery: (value: string) => {
      setQuery(value);
      setPage(1);
    },
    page,
    setPage,
    pageSize,
    setPageSize,
    inStock,
    setInStock: (value: boolean) => {
      setInStock(value);
      setPage(1);
    },
    results,
    pagination,
    loading,
    error,
    hasQuery: Boolean(query.trim()),
  };
}
