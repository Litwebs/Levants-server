import { useCallback, useEffect, useState } from "react";
import type { Review, ListReviewsMeta } from "@/context/Reviews";
import {
  listReviewsAdmin,
  updateReviewVisibility,
  deleteReview,
  bulkDeleteReviews,
  bulkUpdateVisibility,
} from "@/context/Reviews";

type State = {
  reviews: Review[];
  meta: ListReviewsMeta | null;
  loading: boolean;
  error: string | null;
  updatingId: string | null;
  deletingId: string | null;
};

export type VisibilityFilter = "all" | "visible" | "hidden";
export type RatingFilter = "all" | "1" | "2" | "3" | "4" | "5";
export type SortOrder = "newest" | "oldest" | "rating-high" | "rating-low";

export function useReviewsAdmin(initial?: { page?: number; pageSize?: number }) {
  const [page, setPage] = useState(initial?.page ?? 1);
  const [pageSize, setPageSize] = useState(initial?.pageSize ?? 20);

  // Filters
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [sort, setSort] = useState<SortOrder>("newest");

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [state, setState] = useState<State>({
    reviews: [],
    meta: null,
    loading: true,
    error: null,
    updatingId: null,
    deletingId: null,
  });

  const fetch = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await listReviewsAdmin({
        page,
        pageSize,
        search: search || undefined,
        visibility,
        rating: ratingFilter,
        sort,
      });
      setState((s) => ({
        ...s,
        reviews: res.reviews,
        meta: res.meta ?? null,
        loading: false,
      }));
    } catch (err: any) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err?.response?.data?.message || err?.message || "Failed to load reviews",
      }));
    }
  }, [page, pageSize, search, visibility, ratingFilter, sort]);

  useEffect(() => {
    void fetch();
  }, [fetch]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [search, visibility, ratingFilter, sort]);

  // Bulk selection helpers
  const toggleSelectAll = (ids: string[]) => {
    setSelectedIds((prev) =>
      prev.length === ids.length ? [] : [...ids],
    );
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const clearSelection = () => setSelectedIds([]);

  const toggleVisibility = useCallback(
    async (reviewId: string, isVisible: boolean) => {
      setState((s) => ({ ...s, updatingId: reviewId }));
      try {
        await updateReviewVisibility(reviewId, { isVisible });
        await fetch();
        setState((s) => ({ ...s, updatingId: null }));
      } catch (err) {
        setState((s) => ({ ...s, updatingId: null }));
        throw err;
      }
    },
    [fetch],
  );

  const remove = useCallback(
    async (reviewId: string) => {
      setState((s) => ({ ...s, deletingId: reviewId }));
      try {
        await deleteReview(reviewId);
        await fetch();
        setState((s) => ({ ...s, deletingId: null }));
        setSelectedIds((prev) => prev.filter((id) => id !== reviewId));
      } catch (err) {
        setState((s) => ({ ...s, deletingId: null }));
        throw err;
      }
    },
    [fetch],
  );

  const bulkDelete = useCallback(
    async (ids: string[]) => {
      const result = await bulkDeleteReviews(ids);
      await fetch();
      setSelectedIds([]);
      return result;
    },
    [fetch],
  );

  const bulkToggleVisibility = useCallback(
    async (ids: string[], isVisible: boolean) => {
      const result = await bulkUpdateVisibility(ids, isVisible);
      await fetch();
      setSelectedIds([]);
      return result;
    },
    [fetch],
  );

  const totalPages = state.meta?.totalPages ?? 1;

  return {
    ...state,
    page,
    pageSize,
    totalPages,
    setPage,
    setPageSize,
    // filters
    search,
    setSearch,
    visibility,
    setVisibility,
    ratingFilter,
    setRatingFilter,
    sort,
    setSort,
    // selection
    selectedIds,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    // actions
    toggleVisibility,
    remove,
    bulkDelete,
    bulkToggleVisibility,
    refresh: fetch,
  };
}
