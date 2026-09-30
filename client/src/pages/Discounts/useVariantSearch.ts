import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchVariants, type VariantSearchItem } from "@/context/Discounts";

export function useVariantSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VariantSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(8);
  const [inStock, setInStock] = useState(false);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 8, total: 0, totalPages: 1 });

  const debounceRef = useRef<number | null>(null);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    setLoading(true);
    setError(null);
    try {
      const response = await searchVariants({ q: trimmed, page, pageSize, inStock });
      setResults(response.variants);
      setPagination(response.pagination);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [inStock, page, pageSize]);

  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);

    debounceRef.current = window.setTimeout(() => {
      void runSearch(query);
    }, 250);

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  const hasQuery = useMemo(() => query.trim().length > 0, [query]);

  const updateQuery = useCallback((value: string) => {
    setPage(1);
    setQuery(value);
  }, []);

  const updateInStock = useCallback((value: boolean) => {
    setPage(1);
    setInStock(value);
  }, []);

  return {
    query,
    setQuery: updateQuery,
    results,
    loading,
    error,
    hasQuery,
    page,
    setPage,
    pageSize,
    setPageSize,
    inStock,
    setInStock: updateInStock,
    pagination,
  };
}
