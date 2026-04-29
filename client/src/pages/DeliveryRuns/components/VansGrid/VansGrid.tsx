import React, { useState } from "react";
import { Truck, Map, Send, Clock } from "lucide-react";
import type { VanRoute, VanId, RunStatus } from "@/context/DeliveryRuns";
import { getVanStyleKey } from "@/context/DeliveryRuns";
import { Button, Modal, ModalFooter } from "@/components/common";
import styles from "./VansGrid.module.css";

interface VansGridProps {
  vans: VanRoute[];
  runStatus: RunStatus;
  onViewRoute: (vanId: VanId) => void;
  onDispatchVan: (vanId: VanId) => void;
  dispatchingRouteId?: string | null;
}

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

const formatStartTime = (iso: string | undefined) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/London",
    });
  } catch {
    return null;
  }
};

export const VansGrid: React.FC<VansGridProps> = ({
  vans,
  runStatus,
  onViewRoute,
  onDispatchVan,
  dispatchingRouteId,
}) => {
  const canDispatch = runStatus === "routed";
  const [pendingDispatchVan, setPendingDispatchVan] = useState<VanRoute | null>(
    null,
  );

  const handleConfirmDispatch = () => {
    if (!pendingDispatchVan) return;
    onDispatchVan(pendingDispatchVan.vanId);
    setPendingDispatchVan(null);
  };

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
    <>
      <div className={styles.grid}>
        {vans.map((van) => {
          const isDispatching =
            !!dispatchingRouteId && dispatchingRouteId === van.routeId;
          const anyDispatching = !!dispatchingRouteId;

          return (
            <div key={van.vanId} className={styles.card}>
              <div className={styles.cardHeader}>
                <div
                  className={`${styles.vanIcon} ${styles[getVanStyleKey(van.vanId)]}`}
                >
                  <Truck size={20} />
                </div>
                <span className={styles.vanName}>{van.name}</span>
              </div>

              {formatStartTime(van.startTime) && (
                <div className={styles.startTime}>
                  <Clock size={13} />
                  <span>Starts {formatStartTime(van.startTime)}</span>
                </div>
              )}

              <div className={styles.stats}>
                <div className={styles.stat}>
                  <div className={styles.statValue}>{van.stats.stops}</div>
                  <div className={styles.statLabel}>Stops</div>
                </div>
                <div className={styles.stat}>
                  <div className={styles.statValue}>
                    {formatMilesFromKm(van.stats.distanceKm)} mi
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
                {canDispatch && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => setPendingDispatchVan(van)}
                    disabled={anyDispatching}
                    isLoading={isDispatching}
                    leftIcon={<Send size={16} />}
                  >
                    {isDispatching ? "Dispatching..." : "Dispatch"}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => onViewRoute(van.vanId)}
                  leftIcon={<Map size={16} />}
                >
                  View Route
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        isOpen={!!pendingDispatchVan}
        onClose={() => setPendingDispatchVan(null)}
        title={`Dispatch ${pendingDispatchVan?.name ?? ""}?`}
        size="sm"
      >
        <p
          style={{
            fontSize: "var(--text-sm)",
            color: "var(--color-gray-600)",
            margin: 0,
          }}
        >
          This will mark <strong>{pendingDispatchVan?.name}</strong> as
          dispatched and send dispatch emails to all customers on this route.
        </p>
        <ModalFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setPendingDispatchVan(null)}
          >
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={handleConfirmDispatch}>
            <Send size={14} />
            Confirm Dispatch
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default VansGrid;
