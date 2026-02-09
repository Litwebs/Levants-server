import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Eye } from 'lucide-react';
import { DeliveryRunListItem, RunStatus } from '../../types';
import { Badge } from '@/components/common';
import { Button } from '@/components/common';
import styles from './DeliveryRunsTable.module.css';

interface DeliveryRunsTableProps {
  runs: DeliveryRunListItem[];
  loading?: boolean;
}

const STATUS_BADGE_VARIANTS: Record<RunStatus, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  draft: 'default',
  locked: 'info',
  routed: 'warning',
  dispatched: 'info',
  completed: 'success'
};

const STATUS_LABELS: Record<RunStatus, string> = {
  draft: 'Draft',
  locked: 'Locked',
  routed: 'Routed',
  dispatched: 'Dispatched',
  completed: 'Completed'
};

const formatDate = (dateStr: string) => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

export const DeliveryRunsTable: React.FC<DeliveryRunsTableProps> = ({ runs, loading }) => {
  const navigate = useNavigate();

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

  return (
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
        {runs.map((run) => (
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
                <span className={styles.unassignedWarning}>{run.unassignedCount}</span>
              ) : (
                run.unassignedCount
              )}
            </td>
            <td className={styles.cell}>
              {run.distanceKm > 0 ? `${run.distanceKm} km` : '—'}
            </td>
            <td className={styles.cell}>
              {run.durationMin > 0 ? formatDuration(run.durationMin) : '—'}
            </td>
            <td className={styles.cell}>
              {run.lastOptimizedAt
                ? new Date(run.lastOptimizedAt).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit'
                  })
                : '—'}
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
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default DeliveryRunsTable;
