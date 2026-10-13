import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Truck } from "lucide-react";
import type { DeliveryRunListItem, RunStatus } from "@/context/DeliveryRuns";
import {
  Badge,
  DataTableCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/common";
import styles from "./DeliveryRunsTable.module.css";
import sharedTableStyles from "@/components/common/DataTableCard/DataTableCard.module.css";

const PAGE_SIZE_OPTIONS = [
  { value: "10", label: "10 / page" },
  { value: "20", label: "20 / page" },
  { value: "50", label: "50 / page" },
];

interface DeliveryRunsTableProps {
  runs: DeliveryRunListItem[];
  loading?: boolean;
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
}) => {
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

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

  return (
    <>
      <DataTableCard
        loading={loading}
        loadingText="Loading delivery runs…"
        pagination={{
          page,
          pageSize,
          total,
          totalPages,
          setPage,
          setPageSize,
          pageSizeOptions: PAGE_SIZE_OPTIONS,
          loading,
        }}
      >
        <Table withWrapper={false}>
          <TableHeader>
            <TableRow>
              <TableHead>Delivery Date</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Orders</TableHead>
              <TableHead>Drops</TableHead>
              <TableHead>Unassigned</TableHead>
              <TableHead>Distance</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Last Optimized</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
          {!loading && pageRuns.length === 0 ? (
            <TableRow className={sharedTableStyles.emptyStateRow}>
              <TableCell className={sharedTableStyles.emptyTableCell} colSpan={8}>
                <div className={styles.emptyState}>
                  <Truck className={styles.emptyIcon} aria-hidden="true" />
                  <h3 className={styles.emptyTitle}>No delivery runs found</h3>
                  <p className={styles.emptyText}>
                    Create a new delivery run to start planning routes.
                  </p>
                </div>
              </TableCell>
            </TableRow>
          ) : pageRuns.map((run) => (
            <TableRow
              key={run.id}
              className={styles.row}
              onClick={() => navigate(`/delivery-runs/${run.id}`)}
            >
              <TableCell className={styles.dateCell}>
                {formatDate(run.deliveryDate)}
              </TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE_VARIANTS[run.status]}>
                  {STATUS_LABELS[run.status]}
                </Badge>
              </TableCell>
              <TableCell>{run.ordersCount}</TableCell>
              <TableCell>{run.dropsCount}</TableCell>
              <TableCell>
                {run.unassignedCount > 0 ? (
                  <span className={styles.unassignedWarning}>
                    {run.unassignedCount}
                  </span>
                ) : (
                  run.unassignedCount
                )}
              </TableCell>
              <TableCell>
                {run.distanceKm > 0
                  ? `${formatMilesFromKm(run.distanceKm)} mi`
                  : "—"}
              </TableCell>
              <TableCell>
                {run.durationMin > 0 ? formatDuration(run.durationMin) : "—"}
              </TableCell>
              <TableCell>
                {run.lastOptimizedAt
                  ? new Date(run.lastOptimizedAt).toLocaleString("en-GB", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
          </TableBody>
        </Table>
      </DataTableCard>

    </>
  );
};

export default DeliveryRunsTable;
