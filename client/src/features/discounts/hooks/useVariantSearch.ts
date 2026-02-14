import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { searchVariants, type VariantSearchItem } from "../api/variantsSearchApi";

export function useVariantSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VariantSearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const debounceRef = useRef<number | null>(null);

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const items = await searchVariants({ q: trimmed, limit: 10 });
      setResults(items);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || "Search failed");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

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

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    hasQuery,
  };
}
