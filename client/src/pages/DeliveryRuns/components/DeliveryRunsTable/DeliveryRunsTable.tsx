import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Truck, Eye, AlertTriangle, Trash2 } from "lucide-react";
import type { DeliveryRunListItem, RunStatus } from "@/context/DeliveryRuns";
import { Badge, Button, Modal, ModalFooter, Select } from "@/components/common";
import styles from "./DeliveryRunsTable.module.css";

interface DeliveryRunsTableProps {
  runs: DeliveryRunListItem[];
  loading?: boolean;
  onDeleteRun?: (
    runId: string,
  ) => Promise<{ success: true } | { success: false; message?: string }>;
}

const STATUS_BADGE_VARIANTS: Record<
  RunStatus,
  "default" | "info" | "warning" | "success" | "error"
> = {
  draft: "default",
  locked: "info",
  routed: "warning",
  dispatched: "info",
  completed: "success",
};

const STATUS_LABELS: Record<RunStatus, string> = {
  draft: "Draft",
  locked: "Locked",
  routed: "Routed",
  dispatched: "Dispatched",
  completed: "Completed",
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

const KM_TO_MI = 0.621371;

const formatMilesFromKm = (km: number) => {
  const num = Number(km);
  if (!Number.isFinite(num) || num <= 0) return "0.00";
  return (num * KM_TO_MI).toFixed(2);
};

const formatDuration = (minutes: number) => {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return "0.00m";
  if (total < 60) return `${total.toFixed(2)}m`;
  const hours = Math.floor(total / 60);
  const mins = total - hours * 60;
  return mins > 0 ? `${hours}h ${mins.toFixed(2)}m` : `${hours}h`;
};

export const DeliveryRunsTable: React.FC<DeliveryRunsTableProps> = ({
  runs,
  loading,
  onDeleteRun,
}) => {
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [confirmRun, setConfirmRun] = useState<DeliveryRunListItem | null>(
    null,
  );
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [runs.length]);

  const total = runs.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageRuns = useMemo(() => {
    const startIndex = (page - 1) * pageSize;
    return runs.slice(startIndex, startIndex + pageSize);
  }, [page, pageSize, runs]);

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(page * pageSize, total);

  if (!loading && runs.length === 0) {
    return (
      <div className={styles.emptyState}>
        <Truck className={styles.emptyIcon} />
        <h3 className={styles.emptyTitle}>No delivery runs found</h3>
        <p className={styles.emptyText}>
          Create a new delivery run to start planning routes.
        </p>
      </div>
    );
  }

  const closeConfirm = () => {
    if (deleteLoading) return;
    setConfirmRun(null);
  };

  const confirmDelete = async () => {
    if (!confirmRun || !onDeleteRun) return;
    setDeleteLoading(true);
    try {
      const result = await onDeleteRun(confirmRun.id);
      if (result.success) {
        setConfirmRun(null);
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.headerCell}>Delivery Date</th>
              <th className={styles.headerCell}>Status</th>
              <th className={styles.headerCell}>Orders</th>
              <th className={styles.headerCell}>Drops</th>
              <th className={styles.headerCell}>Unassigned</th>
              <th className={styles.headerCell}>Distance</th>
              <th className={styles.headerCell}>Duration</th>
              <th className={styles.headerCell}>Last Optimized</th>
              <th className={styles.headerCell}></th>
            </tr>
          </thead>
          <tbody>
            {pageRuns.map((run) => (
              <tr key={run.id} className={styles.row}>
                <td className={`${styles.cell} ${styles.dateCell}`}>
                  {formatDate(run.deliveryDate)}
                </td>
                <td className={styles.cell}>
                  <Badge variant={STATUS_BADGE_VARIANTS[run.status]}>
                    {STATUS_LABELS[run.status]}
                  </Badge>
                </td>
                <td className={styles.cell}>{run.ordersCount}</td>
                <td className={styles.cell}>{run.dropsCount}</td>
                <td className={styles.cell}>
                  {run.unassignedCount > 0 ? (
                    <span className={styles.unassignedWarning}>
                      {run.unassignedCount}
                    </span>
                  ) : (
                    run.unassignedCount
                  )}
                </td>
                <td className={styles.cell}>
                  {run.distanceKm > 0
                    ? `${formatMilesFromKm(run.distanceKm)} mi`
                    : "—"}
                </td>
                <td className={styles.cell}>
                  {run.durationMin > 0 ? formatDuration(run.durationMin) : "—"}
                </td>
                <td className={styles.cell}>
                  {run.lastOptimizedAt
                    ? new Date(run.lastOptimizedAt).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—"}
                </td>
                <td className={styles.cell}>
                  <div className={styles.actions}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigate(`/delivery-runs/${run.id}`)}
                    >
                      <Eye size={16} />
                      View
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmRun(run)}
                      disabled={!onDeleteRun}
                    >
                      <Trash2 size={16} />
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={!!confirmRun}
        onClose={closeConfirm}
        title="Delete Delivery Run"
        size="sm"
      >
        <div
          style={{
            display: "flex",
            gap: "var(--space-3)",
            alignItems: "flex-start",
          }}
        >
          <div style={{ marginTop: 2, color: "var(--color-warning-600)" }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <p style={{ marginBottom: "var(--space-2)" }}>
              Delete this delivery run?
            </p>
            <p
              style={{
                color: "var(--color-gray-600)",
                fontSize: "var(--text-sm)",
              }}
            >
              This will delete its routes and stops. This cannot be undone.
            </p>
          </div>
        </div>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={closeConfirm}
            disabled={deleteLoading}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={confirmDelete}
            disabled={deleteLoading || !onDeleteRun}
          >
            <Trash2 size={16} />
            Delete
          </Button>
        </ModalFooter>
      </Modal>

      {total > 0 && (
        <div className={styles.paginationFooter}>
          <div className={styles.paginationInfo}>
            Showing {rangeStart}–{rangeEnd} of {total}
          </div>

          <div className={styles.paginationControls}>
            <Select
              className={styles.pageSizeSelect}
              value={String(pageSize)}
              disabled={!!loading}
              onChange={(v) => {
                setPageSize(Number(v));
                setPage(1);
              }}
              options={[
                { value: "10", label: "10 / page" },
                { value: "20", label: "20 / page" },
                { value: "50", label: "50 / page" },
              ]}
            />

            <div className={styles.pageButtons}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || totalPages <= 1}
              >
                Prev
              </Button>
              <span className={styles.pageLabel}>
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || totalPages <= 1}
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DeliveryRunsTable;
