import { useState, useEffect } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
  Filter,
  X,
  Trash2,
  CheckCircle2,
  EyeOff,
} from "lucide-react";
import type { Review } from "@/context/Reviews";
import {
  Badge,
  Button,
  Card,
  CardFooter,
  Modal,
  ModalFooter,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/common";
import { useToast } from "@/components/common/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useReviewsAdmin,
  type RatingFilter,
  type SortOrder,
  type VisibilityFilter,
} from "./useReviewsAdmin";
import styles from "./ReviewsPage.module.css";

const StarDisplay = ({ rating }: { rating: number }) => (
  <span aria-label={`${rating} out of 5`}>
    {"★".repeat(rating)}
    {"☆".repeat(5 - rating)}
  </span>
);

const formatDate = (value?: string) => {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getErrorMessage = (error: unknown, fallback: string) => {
  const candidate = error as { response?: { data?: { message?: string } } };
  return candidate?.response?.data?.message || fallback;
};

export const ReviewsPage = () => {
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();

  const canUpdate = hasPermission("reviews.update");
  const canDelete = hasPermission("reviews.delete");

  const {
    reviews,
    loading,
    error,
    meta,
    page,
    pageSize,
    totalPages,
    updatingId,
    deletingId,
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
  } = useReviewsAdmin({ page: 1, pageSize: 20 });

  const total = meta?.total ?? 0;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, total);

  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [paginationAction, setPaginationAction] = useState<
    "prev" | "next" | null
  >(null);
  const [showFilters, setShowFilters] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  useEffect(() => {
    if (!loading) setPaginationAction(null);
  }, [loading]);

  // Keep the detail modal in sync when data refreshes after a toggle
  const liveSelected = selectedReview
    ? (reviews.find((r) => r._id === selectedReview._id) ?? selectedReview)
    : null;

  const handleSetApproval = async (id: string, isApproved: boolean) => {
    try {
      await toggleVisibility(id, isApproved);
      showToast({
        message: isApproved
          ? "Review approved and published"
          : "Approval removed and review unpublished",
        type: "success",
      });
    } catch (error: unknown) {
      showToast({
        message: getErrorMessage(error, "Failed to update review"),
        type: "error",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await remove(deleteTargetId);
      setDeleteTargetId(null);
      // Close detail modal if it was the deleted review
      if (selectedReview?._id === deleteTargetId) setSelectedReview(null);
      showToast({ message: "Review deleted", type: "success" });
    } catch (error: unknown) {
      showToast({
        message: getErrorMessage(error, "Failed to delete review"),
        type: "error",
      });
    }
  };

  const handleBulkDelete = async () => {
    setBulkLoading(true);
    try {
      const result = await bulkDelete(selectedIds);
      setBulkDeleteConfirm(false);
      showToast({
        message: `Deleted ${result?.deleted ?? selectedIds.length} review(s)`,
        type: "success",
      });
    } catch (error: unknown) {
      showToast({
        message: getErrorMessage(error, "Bulk delete failed"),
        type: "error",
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkVisibility = async (isApproved: boolean) => {
    setBulkLoading(true);
    try {
      const result = await bulkToggleVisibility(selectedIds, isApproved);
      showToast({
        message: `${isApproved ? "Approved" : "Unpublished"} ${result?.updated ?? selectedIds.length} review(s)`,
        type: "success",
      });
    } catch (error: unknown) {
      showToast({
        message: getErrorMessage(error, "Bulk update failed"),
        type: "error",
      });
    } finally {
      setBulkLoading(false);
    }
  };

  const allPageIds = reviews.map((r) => r._id);
  const allSelected =
    allPageIds.length > 0 && allPageIds.every((id) => selectedIds.includes(id));
  const someSelected = selectedIds.length > 0 && !allSelected;
  const activeFilterCount = [
    visibility !== "all",
    ratingFilter !== "all",
    search.trim() !== "",
  ].filter(Boolean).length;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Reviews</div>
          <div className={styles.subtitle}>
            Review customer submissions and approve them before they appear on
            the storefront.
          </div>
        </div>
      </div>

      {/* Filter bar */}
      <Card className={styles.filtersCard}>
        <div className={styles.searchRow}>
          <div className={styles.searchInput}>
            <Search size={18} className={styles.searchIcon} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer or order ID…"
              className={styles.search}
            />
            {search && (
              <button
                type="button"
                className={styles.clearSearch}
                onClick={() => setSearch("")}
              >
                <X size={16} />
              </button>
            )}
          </div>

          <Button
            variant="outline"
            leftIcon={<Filter size={16} />}
            onClick={() => setShowFilters((v) => !v)}
            className={styles.filtersToggleBtn}
          >
            Filters
            {activeFilterCount > 0 && (
              <span className={styles.filterBadge}>{activeFilterCount}</span>
            )}
          </Button>

          <Select
            value={sort}
            onChange={(value) => setSort(value as SortOrder)}
            className={styles.sortSelect}
            options={[
              { value: "newest", label: "Newest First" },
              { value: "oldest", label: "Oldest First" },
              { value: "rating-high", label: "Rating High → Low" },
              { value: "rating-low", label: "Rating Low → High" },
            ]}
          />
        </div>

        {showFilters && (
          <div className={styles.filtersRow}>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Approval status</label>
              <Select
                value={visibility}
                onChange={(value) =>
                  setVisibility(value as VisibilityFilter)
                }
                options={[
                  { value: "all", label: "All reviews" },
                  { value: "hidden", label: "Pending approval" },
                  { value: "visible", label: "Approved" },
                ]}
              />
            </div>

            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Rating</label>
              <Select
                value={ratingFilter}
                onChange={(value) => setRatingFilter(value as RatingFilter)}
                options={[
                  { value: "all", label: "All Ratings" },
                  { value: "5", label: "★★★★★  5 stars" },
                  { value: "4", label: "★★★★☆  4 stars" },
                  { value: "3", label: "★★★☆☆  3 stars" },
                  { value: "2", label: "★★☆☆☆  2 stars" },
                  { value: "1", label: "★☆☆☆☆  1 star" },
                ]}
              />
            </div>

            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setVisibility("all");
                  setRatingFilter("all");
                  setSearch("");
                }}
              >
                <X size={14} />
                Clear Filters
              </Button>
            )}
          </div>
        )}
      </Card>

      {/* Bulk actions bar */}
      {selectedIds.length > 0 && (
        <Card className={styles.bulkActions}>
          <div className={styles.bulkContent}>
            <span className={styles.bulkCount}>
              {selectedIds.length} review{selectedIds.length !== 1 ? "s" : ""}{" "}
              selected
            </span>
            <div className={styles.bulkButtons}>
              {canUpdate && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkLoading}
                    onClick={() => handleBulkVisibility(true)}
                  >
                    <CheckCircle2 size={15} />
                    Approve
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={bulkLoading}
                    onClick={() => handleBulkVisibility(false)}
                  >
                    <EyeOff size={15} />
                    Unpublish
                  </Button>
                </>
              )}
              {canDelete && (
                <Button
                  variant="danger"
                  size="sm"
                  disabled={bulkLoading}
                  onClick={() => setBulkDeleteConfirm(true)}
                >
                  <Trash2 size={15} />
                  Delete Selected
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={clearSelection}>
                Clear Selection
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card>
        {loading && <div className={styles.stateMessage}>Loading…</div>}
        {!loading && error && (
          <div className={styles.errorMessage}>{error}</div>
        )}
        {!loading && !error && (
          <div className={styles.tableWrapper}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={styles.checkboxCell}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={() => toggleSelectAll(allPageIds)}
                    />
                  </TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Image</TableHead>
                  <TableHead>Approval status</TableHead>
                  <TableHead>Date</TableHead>
                  {canDelete && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <span className={styles.muted}>No reviews found.</span>
                    </TableCell>
                  </TableRow>
                )}
                {reviews.map((r) => {
                  const isDeleting = deletingId === r._id;
                  const isChecked = selectedIds.includes(r._id);
                  return (
                    <TableRow
                      key={r._id}
                      onClick={() => setSelectedReview(r)}
                      className={`${styles.clickableRow}${isChecked ? ` ${styles.selectedRow}` : ""}`}
                    >
                      <TableCell
                        className={styles.checkboxCell}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelect(r._id);
                        }}
                      >
                        <input
                          type="checkbox"
                          className={styles.checkbox}
                          checked={isChecked}
                          onChange={() => toggleSelect(r._id)}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableCell>
                      <TableCell>
                        <code className={styles.orderId}>{r.orderId}</code>
                      </TableCell>
                      <TableCell>{r.customerName}</TableCell>
                      <TableCell>
                        <span className={styles.stars}>
                          <StarDisplay rating={r.rating} />
                        </span>
                      </TableCell>
                      <TableCell>
                        {r.imageUrl ? (
                          <img
                            src={r.imageUrl}
                            alt="Review"
                            className={styles.thumbnail}
                          />
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.isVisible ? "success" : "warning"}>
                          {r.isVisible ? "Approved" : "Pending approval"}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatDate(r.createdAt)}</TableCell>
                      {canDelete && (
                        <TableCell>
                          <div className={styles.actions}>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={isDeleting}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTargetId(r._id);
                              }}
                            >
                              {isDeleting ? "Deleting…" : "Delete"}
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <CardFooter className={styles.paginationFooter}>
          <div className={styles.paginationInfo}>
            {total === 0
              ? "No reviews"
              : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
          </div>

          <div className={styles.paginationControls}>
            <Select
              className={styles.pageSizeSelect}
              value={String(pageSize)}
              disabled={loading}
              onChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
              options={[
                { value: "20", label: "20 / page" },
                { value: "50", label: "50 / page" },
                { value: "100", label: "100 / page" },
              ]}
            />

            <div className={styles.pageButtons}>
              <Button
                variant="outline"
                size="sm"
                disabled={loading || page <= 1}
                onClick={() => {
                  setPaginationAction("prev");
                  setPage((p) => Math.max(1, p - 1));
                }}
              >
                {loading && paginationAction === "prev" ? (
                  <Loader2 size={14} className={styles.spinnerIcon} />
                ) : (
                  <>
                    <ChevronLeft size={16} />
                    Prev
                  </>
                )}
              </Button>

              <div className={styles.pageLabel}>
                Page {page} / {totalPages}
              </div>

              <Button
                variant="outline"
                size="sm"
                disabled={loading || page >= totalPages}
                onClick={() => {
                  setPaginationAction("next");
                  setPage((p) => Math.min(totalPages, p + 1));
                }}
              >
                {loading && paginationAction === "next" ? (
                  <Loader2 size={14} className={styles.spinnerIcon} />
                ) : (
                  <>
                    Next
                    <ChevronRight size={16} />
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardFooter>
      </Card>

      {/* Review detail modal */}
      {liveSelected && (
        <Modal
          isOpen={!!liveSelected}
          onClose={() => setSelectedReview(null)}
          title="Review Details"
        >
          <div className={styles.detailGrid}>
            {/* Hero image */}
            {liveSelected.imageUrl && (
              <a
                href={liveSelected.imageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.detailImageWrapper}
              >
                <img
                  src={liveSelected.imageUrl}
                  alt="Review image"
                  className={styles.detailImage}
                />
                <span className={styles.detailImageOverlay}>
                  View full size ↗
                </span>
              </a>
            )}

            {/* Meta row */}
            <div className={styles.detailMeta}>
              <div className={styles.detailMetaLeft}>
                <span className={styles.detailCustomer}>
                  {liveSelected.customerName}
                </span>
                <span className={styles.detailDate}>
                  {formatDate(liveSelected.createdAt)}
                </span>
              </div>
              <div className={styles.detailMetaRight}>
                <span className={styles.starsLarge}>
                  <StarDisplay rating={liveSelected.rating} />
                </span>
                <span className={styles.detailRatingText}>
                  {liveSelected.rating} / 5
                </span>
              </div>
            </div>

            {/* Order ID chip */}
            <div className={styles.detailOrderRow}>
              <span className={styles.detailChipLabel}>Order</span>
              <code className={styles.orderId}>{liveSelected.orderId}</code>
            </div>

            {/* Description */}
            <div className={styles.detailDescriptionBox}>
              <p className={styles.detailDescriptionText}>
                {liveSelected.description}
              </p>
            </div>

            {/* Actions row */}
            <div className={styles.detailActions}>
              {canUpdate && (
                <div className={styles.detailVisibilityField}>
                  <Select
                    label="Approval status"
                    value={liveSelected.isVisible ? "visible" : "hidden"}
                    options={[
                      { value: "hidden", label: "Pending approval" },
                      { value: "visible", label: "Approved and published" },
                    ]}
                    disabled={updatingId === liveSelected._id}
                    onChange={(val) =>
                      handleSetApproval(liveSelected._id, val === "visible")
                    }
                  />
                </div>
              )}
              {canDelete && (
                <div className={styles.detailDeleteField}>
                  <span className={styles.detailDeleteLabel}>Danger zone</span>
                  <Button
                    variant="danger"
                    disabled={!!deletingId}
                    onClick={() => setDeleteTargetId(liveSelected._id)}
                  >
                    {deletingId === liveSelected._id
                      ? "Deleting…"
                      : "Delete Review"}
                  </Button>
                </div>
              )}
            </div>
          </div>

          <ModalFooter>
            <Button variant="outline" onClick={() => setSelectedReview(null)}>
              Close
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* Delete confirmation modal */}
      <Modal
        isOpen={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        title="Delete Review"
      >
        <p>
          Are you sure you want to permanently delete this review? This action
          cannot be undone.
        </p>
        <ModalFooter>
          <Button variant="outline" onClick={() => setDeleteTargetId(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={!!deletingId}
            onClick={handleDelete}
          >
            {deletingId ? "Deleting…" : "Delete"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Bulk delete confirmation modal */}
      <Modal
        isOpen={bulkDeleteConfirm}
        onClose={() => setBulkDeleteConfirm(false)}
        title="Delete Selected Reviews"
      >
        <p>
          Are you sure you want to permanently delete{" "}
          <strong>{selectedIds.length}</strong> review
          {selectedIds.length !== 1 ? "s" : ""}? This action cannot be undone.
        </p>
        <ModalFooter>
          <Button
            variant="outline"
            disabled={bulkLoading}
            onClick={() => setBulkDeleteConfirm(false)}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            disabled={bulkLoading}
            onClick={handleBulkDelete}
          >
            {bulkLoading ? "Deleting…" : `Delete ${selectedIds.length}`}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};
