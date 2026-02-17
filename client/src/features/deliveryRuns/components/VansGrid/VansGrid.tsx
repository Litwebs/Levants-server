import React from "react";
import { Truck, Map, FileText, Printer } from "lucide-react";
import { VanRoute, VanId, getVanStyleKey } from "../../types";
import { Button } from "@/components/common";
import styles from "./VansGrid.module.css";

interface VansGridProps {
  vans: VanRoute[];
  onViewRoute: (vanId: VanId) => void;
  onViewManifest: (vanId: VanId) => void;
  onPrint: (vanId: VanId) => void;
}

const formatKm = (km: number) => {
  const num = Number(km);
  return Number.isFinite(num) ? num.toFixed(2) : "0.00";
};

const formatDuration = (minutes: number) => {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return "0.00m";
  if (total < 60) return `${total.toFixed(2)}m`;
  const hours = Math.floor(total / 60);
  const mins = total - hours * 60;
  return mins > 0 ? `${hours}h ${mins.toFixed(2)}m` : `${hours}h`;
};

export const VansGrid: React.FC<VansGridProps> = ({
  vans,
  onViewRoute,
  onViewManifest,
  onPrint,
}) => {
  if (vans.length === 0) {
    return (
      <div className={styles.grid}>
        <div className={styles.emptyState}>
          <Truck className={styles.emptyIcon} />
          <h3 className={styles.emptyTitle}>No routes generated</h3>
          <p className={styles.emptyText}>
            Optimize routes to assign orders to vans
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.grid}>
      {vans.map((van) => (
        <div key={van.vanId} className={styles.card}>
          <div className={styles.cardHeader}>
            <div
              className={`${styles.vanIcon} ${styles[getVanStyleKey(van.vanId)]}`}
            >
              <Truck size={20} />
            </div>
            <span className={styles.vanName}>{van.name}</span>
          </div>

          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statValue}>{van.stats.stops}</div>
              <div className={styles.statLabel}>Stops</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>
                {formatKm(van.stats.distanceKm)} km
              </div>
              <div className={styles.statLabel}>Distance</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>
                {formatDuration(van.stats.durationMin)}
              </div>
              <div className={styles.statLabel}>Duration</div>
            </div>
          </div>

          <div className={styles.actions}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onViewRoute(van.vanId)}
            >
              <Map size={16} />
              View Route
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewManifest(van.vanId)}
            >
              <FileText size={16} />
              View Manifest
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onPrint(van.vanId)}
            >
              <Printer size={16} />
              Print
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default VansGrid;
