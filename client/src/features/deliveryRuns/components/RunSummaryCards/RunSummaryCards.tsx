import React from 'react';
import { 
  CheckCircle, Package, MapPin, AlertTriangle, 
  Route, Clock, RefreshCw 
} from 'lucide-react';
import { DeliveryRun, RunStatus } from '../../types';
import { Badge } from '@/components/common';
import styles from './RunSummaryCards.module.css';

interface RunSummaryCardsProps {
  run: DeliveryRun;
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

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

export const RunSummaryCards: React.FC<RunSummaryCardsProps> = ({ run }) => {
  return (
    <div className={styles.grid}>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={`${styles.cardIcon} ${styles.status}`}>
            <CheckCircle size={18} />
          </div>
          <span className={styles.cardLabel}>Status</span>
        </div>
        <Badge variant={STATUS_BADGE_VARIANTS[run.status]} size="md">
          {STATUS_LABELS[run.status]}
        </Badge>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={`${styles.cardIcon} ${styles.orders}`}>
            <Package size={18} />
          </div>
          <span className={styles.cardLabel}>Orders</span>
        </div>
        <div className={styles.cardValue}>{run.totals.ordersCount}</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={`${styles.cardIcon} ${styles.drops}`}>
            <MapPin size={18} />
          </div>
          <span className={styles.cardLabel}>Drops</span>
        </div>
        <div className={styles.cardValue}>{run.totals.dropsCount}</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={`${styles.cardIcon} ${styles.unassigned}`}>
            <AlertTriangle size={18} />
          </div>
          <span className={styles.cardLabel}>Unassigned</span>
        </div>
        <div className={styles.cardValue}>{run.totals.unassignedCount}</div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={`${styles.cardIcon} ${styles.distance}`}>
            <Route size={18} />
          </div>
          <span className={styles.cardLabel}>Distance</span>
        </div>
        <div className={styles.cardValue}>
          {run.totals.estimatedDistanceKm > 0 
            ? `${run.totals.estimatedDistanceKm} km` 
            : '—'}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={`${styles.cardIcon} ${styles.duration}`}>
            <Clock size={18} />
          </div>
          <span className={styles.cardLabel}>Duration</span>
        </div>
        <div className={styles.cardValue}>
          {run.totals.estimatedDurationMin > 0 
            ? formatDuration(run.totals.estimatedDurationMin) 
            : '—'}
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <div className={`${styles.cardIcon} ${styles.optimized}`}>
            <RefreshCw size={18} />
          </div>
          <span className={styles.cardLabel}>Optimized</span>
        </div>
        <div className={styles.cardSubtext}>
          {run.lastOptimizedAt 
            ? new Date(run.lastOptimizedAt).toLocaleString('en-GB', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })
            : 'Not yet optimized'}
        </div>
      </div>
    </div>
  );
};

export default RunSummaryCards;
