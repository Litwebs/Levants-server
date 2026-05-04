import React, { useState, useRef } from "react";
import {
  ChevronDown,
  GripVertical,
  Package,
  Phone,
  MapPin,
  Clock,
  ArrowUpDown,
  Check,
  Loader2,
  CreditCard,
  FileSpreadsheet,
  AlertCircle,
} from "lucide-react";
import type { VanRoute } from "@/context/DeliveryRuns";
import {
  getVanStyleKey,
  getVanColor,
  reorderRouteStops as reorderDeliveryRouteStops,
} from "@/context/DeliveryRuns";
import { useToast } from "@/components/common/Toast";
import styles from "./RouteStopsList.module.css";

interface RouteStopsListProps {
  vans: VanRoute[];
  onRunUpdated: () => Promise<void>;
}

const KM_TO_MI = 0.621371;
const formatMilesFromKm = (km: number) => {
  const num = Number(km);
  if (!Number.isFinite(num) || num <= 0) return "0.00";
  return (num * KM_TO_MI).toFixed(2);
};
const formatDuration = (minutes: number) => {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return "—";
  if (total < 60) return `${Math.round(total)}m`;
  const h = Math.floor(total / 60);
  const m = Math.round(total % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};
const formatEta = (iso?: string) => {
  if (!iso) return undefined;
  try {
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return undefined;
  }
};
const formatCurrency = (amount?: number) => {
  if (amount == null || !Number.isFinite(amount)) return null;
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(amount);
};

interface RouteBlockProps {
  van: VanRoute;
  onRunUpdated: () => Promise<void>;
  isSelected: boolean;
  onSelect: () => void;
}

const RouteBlock: React.FC<RouteBlockProps> = ({
  van,
  onRunUpdated,
  isSelected,
  onSelect,
}) => {
  const { showToast } = useToast();
  const [expandedStops, setExpandedStops] = useState<Set<string>>(new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [reorderedStops, setReorderedStops] = useState<VanRoute["stops"]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const dragIndexRef = useRef<number | null>(null);

  const displayStops = isReorderMode ? reorderedStops : van.stops;

  const toggleStop = (stopId: string) => {
    setExpandedStops((prev) => {
      const next = new Set(prev);
      if (next.has(stopId)) next.delete(stopId);
      else next.add(stopId);
      return next;
    });
  };

  const enterReorderMode = () => {
    setReorderedStops([...van.stops]);
    setIsReorderMode(true);
  };

  const cancelReorderMode = () => {
    setIsReorderMode(false);
    setReorderedStops([]);
    dragIndexRef.current = null;
  };

  const handleDragStart = (index: number) => {
    dragIndexRef.current = index;
  };

  const handleDragEnter = (index: number) => {
    if (dragIndexRef.current === null || dragIndexRef.current === index) return;
    setReorderedStops((prev) => {
      const updated = [...prev];
      const [dragged] = updated.splice(dragIndexRef.current!, 1);
      updated.splice(index, 0, dragged);
      dragIndexRef.current = index;
      return updated;
    });
  };

  const handleDragEnd = () => {
    dragIndexRef.current = null;
  };

  const handleSave = async () => {
    if (!van.routeId) {
      showToast({ type: "error", title: "Route ID not available" });
      return;
    }
    setIsSaving(true);
    try {
      await reorderDeliveryRouteStops(
        van.routeId,
        reorderedStops.map((s) => s.stopId),
      );
      await onRunUpdated();
      showToast({ type: "success", title: "Stop order saved" });
      setIsReorderMode(false);
      setReorderedStops([]);
    } catch (err) {
      showToast({
        type: "error",
        title:
          err instanceof Error && err.message
            ? err.message
            : "Failed to save stop order",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const vanColor = getVanColor(van.vanId);
  const styleKey = getVanStyleKey(van.vanId);

  const deliveredCount = van.stops.filter((s) => {
    const ss = String(s.stopStatus ?? "").toLowerCase();
    const os = String(s.orderDeliveryStatus ?? "").toLowerCase();
    return ss === "delivered" || os === "delivered";
  }).length;
  const totalCount = van.stops.length;

  return (
    <div
      className={`${styles.routeBlock} ${isSelected ? styles.routeBlockSelected : ""}`}
    >
      {/* Route header */}
      <div className={styles.routeHeader} style={{ borderLeftColor: vanColor }}>
        {/* Clickable left area — selects the route */}
        <div
          className={styles.routeHeaderLeft}
          onClick={onSelect}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && onSelect()}
        >
          <div className={`${styles.routeBadge} ${styles[styleKey]}`}>
            {van.name}
          </div>
          <span className={styles.routeStats}>
            {van.stats.stops} stops · {formatMilesFromKm(van.stats.distanceKm)}{" "}
            mi · {formatDuration(van.stats.durationMin)}
          </span>
          <span className={styles.deliveredBadge}>
            <span className={styles.deliveredNum}>{deliveredCount}</span>
            <span className={styles.deliveredSlash}>/</span>
            <span className={styles.deliveredTotal}>{totalCount}</span>{" "}
            delivered
          </span>
        </div>

        {/* Right-side actions */}
        <div className={styles.headerActions}>
          {isReorderMode ? (
            <>
              <button
                className={styles.reorderBtn}
                onClick={cancelReorderMode}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                className={`${styles.reorderBtn} ${styles.saveBtn}`}
                onClick={() => void handleSave()}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 size={13} className={styles.spinner} />
                ) : (
                  <Check size={13} />
                )}
                {isSaving ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <button
              className={`${styles.reorderBtn} ${isReorderMode ? styles.reorderBtnActive : ""}`}
              onClick={enterReorderMode}
              title="Reorder stops"
            >
              <ArrowUpDown size={14} />
              Reorder
            </button>
          )}
          <button
            className={`${styles.collapseBtn} ${isCollapsed ? styles.collapseBtnCollapsed : ""}`}
            onClick={() => setIsCollapsed((c) => !c)}
            title={isCollapsed ? "Expand route" : "Collapse route"}
          >
            <ChevronDown size={16} />
          </button>
        </div>
      </div>

      {/* Reorder hint */}
      {isReorderMode && !isCollapsed && (
        <div className={styles.reorderBanner}>
          Drag rows to reorder stops, then save.
        </div>
      )}

      {/* Stops list */}
      {!isCollapsed && (
        <div className={styles.stopsList}>
          {displayStops.map((stop, index) => {
            const isExpanded = expandedStops.has(stop.stopId);
            const eta = formatEta(stop.eta);
            const total = formatCurrency(stop.orderTotal);
            const payStatus = stop.orderPaymentStatus
              ? String(stop.orderPaymentStatus)
              : null;

            return (
              <div
                key={stop.stopId}
                className={`${styles.stopRow} ${isReorderMode ? styles.stopDraggable : ""}`}
                draggable={isReorderMode}
                onDragStart={
                  isReorderMode ? () => handleDragStart(index) : undefined
                }
                onDragEnter={
                  isReorderMode ? () => handleDragEnter(index) : undefined
                }
                onDragEnd={isReorderMode ? handleDragEnd : undefined}
                onDragOver={
                  isReorderMode ? (e) => e.preventDefault() : undefined
                }
              >
                {/* Main row */}
                <div className={styles.stopMain}>
                  {isReorderMode && (
                    <div className={styles.dragHandle}>
                      <GripVertical size={16} />
                    </div>
                  )}

                  <div className={`${styles.seqBadge} ${styles[styleKey]}`}>
                    {isReorderMode ? index + 1 : stop.sequence}
                  </div>

                  <div className={styles.stopDetails}>
                    <div className={styles.stopName}>{stop.customerName}</div>
                    <div className={styles.stopMeta}>
                      <span className={styles.metaItem}>
                        <MapPin size={12} />
                        {stop.addressLine1}, {stop.postcode}
                      </span>
                      {stop.phone && (
                        <span className={styles.metaItem}>
                          <Phone size={12} />
                          {stop.phone}
                        </span>
                      )}
                      {eta && (
                        <span
                          className={`${styles.metaItem} ${styles.etaItem}`}
                        >
                          <Clock size={12} />
                          ETA {eta}
                        </span>
                      )}
                    </div>
                    <div className={styles.stopTags}>
                      <span className={styles.orderTag}>#{stop.orderId}</span>
                      {total && (
                        <span className={styles.totalTag}>
                          <CreditCard size={11} />
                          {total}
                        </span>
                      )}
                      {payStatus && (
                        <span
                          className={`${styles.payTag} ${
                            payStatus === "paid"
                              ? styles.payTagPaid
                              : payStatus === "partially_paid" ||
                                  payStatus === "partially paid"
                                ? styles.payTagPartial
                                : payStatus === "unpaid"
                                  ? styles.payTagUnpaid
                                  : payStatus === "refunded" ||
                                      payStatus === "refund_pending" ||
                                      payStatus === "partially_refunded"
                                    ? styles.payTagRefunded
                                    : payStatus === "pending"
                                      ? styles.payTagPending
                                      : styles.payTagOther
                          }`}
                        >
                          {payStatus.replace(/_/g, " ")}
                        </span>
                      )}
                      {stop.orderIsManualImport && (
                        <span
                          className={styles.importTag}
                          title="Manually imported order"
                        >
                          <FileSpreadsheet size={11} />
                          Import
                        </span>
                      )}
                      {stop.notes && (
                        <span className={styles.notesTag} title={stop.notes}>
                          <AlertCircle size={11} />
                          Note
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={styles.stopRight}>
                    <span className={styles.itemCount}>
                      <Package size={13} />
                      {stop.items.reduce((s, i) => s + i.qty, 0)} items
                    </span>
                    {!isReorderMode && (
                      <button
                        className={`${styles.expandBtn} ${isExpanded ? styles.expandBtnOpen : ""}`}
                        onClick={() => toggleStop(stop.stopId)}
                        title={isExpanded ? "Collapse" : "Expand items"}
                      >
                        <ChevronDown size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded items panel */}
                {isExpanded && !isReorderMode && (
                  <div className={styles.itemsPanel}>
                    {stop.notes && (
                      <div className={styles.notesRow}>
                        <AlertCircle
                          size={16}
                          style={{ flexShrink: 0, marginTop: 2 }}
                        />
                        <span>{stop.notes}</span>
                      </div>
                    )}
                    <table className={styles.itemsTable}>
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Product</th>
                          <th className={styles.qtyCol}>Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stop.items.map((item, i) => (
                          <tr key={i}>
                            <td className={styles.skuCell}>
                              {item.skuId || "—"}
                            </td>
                            <td>{item.name || "—"}</td>
                            <td className={styles.qtyCell}>{item.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const RouteStopsList: React.FC<RouteStopsListProps> = ({
  vans,
  onRunUpdated,
}) => {
  const [selectedVanId, setSelectedVanId] = useState<string | null>(null);

  if (vans.length === 0) {
    return (
      <div className={styles.empty}>
        No routes generated yet. Optimize to assign orders to drivers.
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {vans.map((van) => (
        <RouteBlock
          key={van.vanId}
          van={van}
          onRunUpdated={onRunUpdated}
          isSelected={selectedVanId === van.vanId}
          onSelect={() =>
            setSelectedVanId((prev) => (prev === van.vanId ? null : van.vanId))
          }
        />
      ))}
    </div>
  );
};

export default RouteStopsList;
