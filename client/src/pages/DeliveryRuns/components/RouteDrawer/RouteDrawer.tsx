import React, { useState, useMemo, useEffect } from "react";
import { X, Truck, Printer, Pencil, Loader2 } from "lucide-react";
import type { VanRoute, VanId } from "@/context/DeliveryRuns";
import { DEPOT_LOCATION, getVanStyleKey } from "@/context/DeliveryRuns";
import { Button } from "@/components/common";
import { getDepotLocation } from "@/context/DeliveryRuns";
import { useToast } from "@/components/common/Toast";
import { useOrdersApi } from "@/context/Orders";
import { usePermissions } from "@/hooks/usePermissions";
import OrderStatusModal from "@/pages/Orders/OrderStatusModal";
import styles from "./RouteDrawer.module.css";

interface RouteDrawerProps {
  van: VanRoute;
  isOpen: boolean;
  onClose: () => void;
  onPrint: () => void;
}

const KM_TO_MI = 0.621371;

const formatMilesFromKm = (km: number) => {
  const num = Number(km);
  if (!Number.isFinite(num) || num <= 0) return "0.00";
  return (num * KM_TO_MI).toFixed(2);
};

const formatEtaTime = (iso?: string) => {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

const formatDuration = (minutes: number) => {
  const total = Number(minutes);
  if (!Number.isFinite(total) || total <= 0) return "0.00 min";
  if (total < 60) return `${total.toFixed(2)} min`;
  const hours = Math.floor(total / 60);
  const mins = total - hours * 60;
  return mins > 0 ? `${hours}h ${mins.toFixed(2)}m` : `${hours}h`;
};

export const RouteDrawer: React.FC<RouteDrawerProps> = ({
  van,
  isOpen,
  onClose,
  onPrint,
}) => {
  const [search, setSearch] = useState("");
  const { showToast } = useToast();
  const { listOrders, updateOrderStatus } = useOrdersApi();
  const { hasPermission } = usePermissions();

  const [statusResolveStopId, setStatusResolveStopId] = useState<string | null>(
    null,
  );
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedOrderForStatus, setSelectedOrderForStatus] = useState<{
    id: string;
    orderNumber: string;
    deliveryStatus: string;
  } | null>(null);
  const [deliveryStatusOverrides, setDeliveryStatusOverrides] = useState<
    Record<string, string>
  >({});
  const [depot, setDepot] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const loc = await getDepotLocation();
        if (mounted) setDepot(loc);
      } catch {
        if (mounted) setDepot(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const filteredStops = useMemo(() => {
    if (!search.trim()) return van.stops;

    const term = search.toLowerCase();
    return van.stops.filter(
      (stop) =>
        stop.customerName.toLowerCase().includes(term) ||
        stop.postcode.toLowerCase().includes(term) ||
        stop.orderId.toLowerCase().includes(term) ||
        stop.addressLine1.toLowerCase().includes(term),
    );
  }, [van.stops, search]);

  const getEffectiveDeliveryStatus = (stop: VanRoute["stops"][0]) => {
    const override = deliveryStatusOverrides[stop.stopId];
    if (typeof override === "string" && override.trim().length > 0)
      return override;

    const candidate =
      (stop as any)?.orderDeliveryStatus ??
      (stop as any)?.deliveryStatus ??
      (stop as any)?.order?.deliveryStatus;

    return typeof candidate === "string" && candidate.trim().length > 0
      ? candidate
      : undefined;
  };

  const resolveOrderIdForStop = async (stop: VanRoute["stops"][0]) => {
    const direct = (stop as any)?.orderDbId || (stop as any)?.order?._id;
    if (typeof direct === "string" && direct.trim().length > 0) return direct;

    const term = String((stop as any)?.orderId ?? "").trim();
    if (!term) return null;

    try {
      const result = await listOrders({ page: 1, pageSize: 10, search: term });
      const exact = (result?.orders ?? []).find(
        (o: any) => String(o?.orderId) === term,
      );
      return exact?._id ? String(exact._id) : null;
    } catch {
      return null;
    }
  };

  const openStatusModalForStop = async (stop: VanRoute["stops"][0]) => {
    if (!hasPermission("orders.update")) return;
    setStatusResolveStopId(stop.stopId);
    try {
      const orderDbId = await resolveOrderIdForStop(stop);
      if (!orderDbId) {
        showToast({
          type: "error",
          title: "Could not find order for this stop",
        });
        return;
      }

      const current = getEffectiveDeliveryStatus(stop) || "ordered";
      setSelectedOrderForStatus({
        id: orderDbId,
        orderNumber: stop.orderId,
        deliveryStatus: current,
      });
      setIsStatusModalOpen(true);
    } finally {
      setStatusResolveStopId(null);
    }
  };

  const handleUpdateOrderStatus = async (id: string, nextStatus: string) => {
    try {
      await updateOrderStatus(
        id,
        nextStatus as
          | "ordered"
          | "dispatched"
          | "in_transit"
          | "delivered"
          | "returned",
      );
      showToast({ type: "success", title: "Order status updated" });

      setSelectedOrderForStatus((prev) =>
        prev ? { ...prev, deliveryStatus: nextStatus } : prev,
      );

      // Find the stopId for this order by matching the opened modal's orderNumber.
      const orderNumber = selectedOrderForStatus?.orderNumber;
      if (orderNumber) {
        const match = van.stops.find((s) => s.orderId === orderNumber);
        if (match?.stopId) {
          setDeliveryStatusOverrides((prev) => ({
            ...prev,
            [match.stopId]: nextStatus,
          }));
        }
      }

      setIsStatusModalOpen(false);
    } catch {
      showToast({ type: "error", title: "Failed to update status" });
    }
  };

  // Build Google Maps directions URL
  const buildMapsUrl = () => {
    const originLat = depot?.lat ?? DEPOT_LOCATION.lat;
    const originLng = depot?.lng ?? DEPOT_LOCATION.lng;
    const origin = `${originLat},${originLng}`;
    const destination =
      van.stops.length > 0
        ? `${van.stops[van.stops.length - 1].lat},${van.stops[van.stops.length - 1].lng}`
        : origin;

    // Google Maps has a limit of ~25 waypoints
    const waypoints = van.stops
      .slice(0, -1)
      .slice(0, 23)
      .map((s) => `${s.lat},${s.lng}`)
      .join("|");

    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    if (waypoints) {
      url += `&waypoints=${waypoints}`;
    }

    return url;
  };

  const handleOpenMaps = () => {
    window.open(buildMapsUrl(), "_blank");
  };

  const handleCopyRoute = () => {
    navigator.clipboard.writeText(buildMapsUrl());
    // Could add toast notification here
  };

  if (!isOpen) return null;

  return (
    <>
      <div className={styles.overlay} onClick={onClose} />
      <div className={styles.drawer}>
        <div className={styles.header}>
          <div
            className={`${styles.vanIcon} ${styles[getVanStyleKey(van.vanId)]}`}
          >
            <Truck size={20} />
          </div>
          <div className={styles.headerInfo}>
            <div className={styles.title}>{van.name} Route</div>
            <div className={styles.subtitle}>
              {van.stats.stops} stops •{" "}
              {formatMilesFromKm(van.stats.distanceKm)} mi •{" "}
              {formatDuration(van.stats.durationMin)}
            </div>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.searchBar}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by customer, postcode, or order..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className={styles.stopsList}>
          {filteredStops.length === 0 ? (
            <div className={styles.emptySearch}>No stops match your search</div>
          ) : (
            filteredStops.map((stop) => (
              <div key={stop.stopId} className={styles.stop}>
                <div className={styles.stopHeader}>
                  <span
                    className={`${styles.stopSequence} ${styles[getVanStyleKey(van.vanId)]}`}
                  >
                    {stop.sequence}
                  </span>
                  <div className={styles.stopInfo}>
                    <div className={styles.stopName}>{stop.customerName}</div>
                    <div className={styles.stopAddress}>
                      {stop.addressLine1}, {stop.postcode}
                    </div>
                    <div className={styles.stopMeta}>
                      <span>Order: {stop.orderId}</span>
                      {stop.eta && (
                        <span className={styles.stopEta}>
                          ETA: {formatEtaTime(stop.eta)}
                        </span>
                      )}
                      {stop.phone && <span>{stop.phone}</span>}
                    </div>
                    {stop.notes && (
                      <div className={styles.stopItems}>📝 {stop.notes}</div>
                    )}
                    <div className={styles.stopItems}>
                      {stop.items.map((item, i) => (
                        <span key={i}>
                          {item.qty}× {item.name}
                          {i < stop.items.length - 1 ? ", " : ""}
                        </span>
                      ))}
                    </div>
                  </div>

                  {hasPermission("orders.update") && (
                    <button
                      type="button"
                      className={styles.statusBtn}
                      onClick={() => void openStatusModalForStop(stop)}
                      disabled={statusResolveStopId === stop.stopId}
                      title="Edit delivery status"
                    >
                      {statusResolveStopId === stop.stopId ? (
                        <Loader2 size={16} className={styles.btnSpinner} />
                      ) : (
                        <Pencil size={16} />
                      )}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className={styles.footer}>
          <Button variant="primary" onClick={onPrint}>
            <Printer size={16} />
            Print
          </Button>
        </div>
      </div>

      <OrderStatusModal
        selectedOrder={selectedOrderForStatus}
        isStatusModalOpen={isStatusModalOpen}
        setIsStatusModalOpen={setIsStatusModalOpen}
        updateOrderStatus={handleUpdateOrderStatus}
      />
    </>
  );
};

export default RouteDrawer;
