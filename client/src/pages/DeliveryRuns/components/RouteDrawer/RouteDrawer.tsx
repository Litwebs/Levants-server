import React, { useState, useMemo, useEffect } from "react";
import {
  X,
  Truck,
  Printer,
  Pencil,
  Loader2,
  ArrowRightLeft,
} from "lucide-react";
import {
  type VanRoute,
  type VanId,
  DEPOT_LOCATION,
  getDepotLocation,
  getVanStyleKey,
  formatManifestItemSku,
  listDrivers as listDeliveryDrivers,
  reassignStopDriver as reassignDeliveryStopDriver,
} from "@/context/DeliveryRuns";
import { Button, Modal, ModalFooter, Select } from "@/components/common";
import { useToast } from "@/components/common/Toast";
import { useOrdersApi } from "@/context/Orders";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuth } from "@/context/Auth/AuthContext";
import OrderStatusModal from "@/pages/Orders/OrderStatusModal";
import styles from "./RouteDrawer.module.css";

interface RouteDrawerProps {
  van: VanRoute;
  isOpen: boolean;
  onClose: () => void;
  onPrint: () => void;
  onRunUpdated: () => Promise<void>;
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
  onRunUpdated,
}) => {
  const [search, setSearch] = useState("");
  const { showToast } = useToast();
  const { listOrders, updateOrderStatus } = useOrdersApi();
  const { hasPermission } = usePermissions();
  const { user } = useAuth();

  const roleName =
    typeof (user as any)?.role === "string"
      ? String((user as any).role)
      : String((user as any)?.role?.name || "");
  const isDriver =
    roleName.toLowerCase() === "driver" ||
    (hasPermission("delivery.routes.read") &&
      !hasPermission("delivery.routes.update"));

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
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [selectedStopForReassign, setSelectedStopForReassign] = useState<
    VanRoute["stops"][0] | null
  >(null);
  const [selectedDriverId, setSelectedDriverId] = useState("");
  const [driverOptions, setDriverOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [reassigningStopId, setReassigningStopId] = useState<string | null>(
    null,
  );

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

  useEffect(() => {
    if (!isReassignModalOpen || !hasPermission("delivery.routes.update")) {
      return;
    }

    let active = true;

    (async () => {
      setDriversLoading(true);
      try {
        const drivers = await listDeliveryDrivers();
        if (!active) return;

        const options = drivers.map((driver) => ({
          value: driver.id,
          label:
            driver.id === van.driverId
              ? `${driver.name} (${driver.email}) - current`
              : `${driver.name} (${driver.email})`,
        }));

        setDriverOptions(options);

        const firstAlternative =
          options.find((option) => option.value !== van.driverId)?.value ||
          options[0]?.value ||
          "";
        setSelectedDriverId((current) => current || firstAlternative);
      } catch {
        if (!active) return;
        setDriverOptions([]);
        showToast({ type: "error", title: "Failed to load drivers" });
      } finally {
        if (active) setDriversLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [isReassignModalOpen, hasPermission, showToast, van.driverId]);

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

    const current = getEffectiveDeliveryStatus(stop) || "ordered";
    if (isDriver && String(current).toLowerCase() === "delivered") {
      showToast({ type: "info", title: "Delivered orders are locked" });
      return;
    }

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

      setSelectedOrderForStatus({
        id: orderDbId,
        orderNumber: stop.orderId,
        deliveryStatus: current,
        customerInstructions: stop.notes,
      });
      setIsStatusModalOpen(true);
    } finally {
      setStatusResolveStopId(null);
    }
  };

  const handleUpdateOrderStatus = async (
    id: string,
    nextStatus: string,
    deliveryProofFile?: File,
    deliveryNote?: string,
  ) => {
    try {
      await updateOrderStatus(
        id,
        nextStatus as
          | "ordered"
          | "dispatched"
          | "in_transit"
          | "delivered"
          | "returned",
        deliveryProofFile,
        deliveryNote,
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

  const openReassignModalForStop = (stop: VanRoute["stops"][0]) => {
    if (!hasPermission("delivery.routes.update")) return;

    setSelectedStopForReassign(stop);
    setSelectedDriverId("");
    setIsReassignModalOpen(true);
  };

  const closeReassignModal = () => {
    if (reassigningStopId) return;
    setIsReassignModalOpen(false);
    setSelectedStopForReassign(null);
    setSelectedDriverId("");
  };

  const handleReassignStop = async () => {
    if (!selectedStopForReassign || !selectedDriverId) return;

    setReassigningStopId(selectedStopForReassign.stopId);
    try {
      await reassignDeliveryStopDriver(
        selectedStopForReassign.stopId,
        selectedDriverId,
      );
      await onRunUpdated();
      showToast({ type: "success", title: "Stop reassigned" });
      setIsReassignModalOpen(false);
      setSelectedStopForReassign(null);
      setSelectedDriverId("");
    } catch (err) {
      showToast({
        type: "error",
        title:
          err instanceof Error && err.message
            ? err.message
            : "Failed to reassign stop",
      });
    } finally {
      setReassigningStopId(null);
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
                          {item.qty}× {formatManifestItemSku(item)}
                          {i < stop.items.length - 1 ? ", " : ""}
                        </span>
                      ))}
                    </div>
                  </div>

                  {(hasPermission("orders.update") ||
                    hasPermission("delivery.routes.update")) &&
                    (() => {
                      const effectiveStatus =
                        getEffectiveDeliveryStatus(stop) || "ordered";
                      const isStatusLocked =
                        isDriver &&
                        String(effectiveStatus).toLowerCase() === "delivered";

                      return (
                        <div className={styles.stopActions}>
                          {hasPermission("delivery.routes.update") && (
                            <button
                              type="button"
                              className={styles.statusBtn}
                              onClick={() => openReassignModalForStop(stop)}
                              disabled={reassigningStopId === stop.stopId}
                              title="Assign stop to a different driver"
                            >
                              {reassigningStopId === stop.stopId ? (
                                <Loader2
                                  size={16}
                                  className={styles.btnSpinner}
                                />
                              ) : (
                                <ArrowRightLeft size={16} />
                              )}
                            </button>
                          )}

                          {hasPermission("orders.update") && (
                            <button
                              type="button"
                              className={styles.statusBtn}
                              onClick={() => void openStatusModalForStop(stop)}
                              disabled={
                                statusResolveStopId === stop.stopId ||
                                isStatusLocked
                              }
                              title={
                                isStatusLocked
                                  ? "Delivered orders are locked"
                                  : "Edit delivery status"
                              }
                            >
                              {statusResolveStopId === stop.stopId ? (
                                <Loader2
                                  size={16}
                                  className={styles.btnSpinner}
                                />
                              ) : (
                                <Pencil size={16} />
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })()}
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

      <Modal
        isOpen={isReassignModalOpen}
        onClose={closeReassignModal}
        title="Assign Stop To Driver"
        size="sm"
      >
        <div className={styles.reassignModalBody}>
          <p className={styles.reassignModalText}>
            {selectedStopForReassign
              ? `Move order ${selectedStopForReassign.orderId} to another driver.`
              : "Move this stop to another driver."}
          </p>

          <Select
            label="Driver"
            value={selectedDriverId}
            onChange={setSelectedDriverId}
            options={driverOptions}
            placeholder="Select a driver"
            fullWidth
            disabled={driversLoading || reassigningStopId !== null}
          />

          {van.driverName && (
            <p className={styles.reassignCurrentDriver}>
              Current driver: {van.driverName}
            </p>
          )}
        </div>

        <ModalFooter>
          <Button
            variant="ghost"
            onClick={closeReassignModal}
            disabled={reassigningStopId !== null}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleReassignStop()}
            disabled={
              driversLoading ||
              !selectedDriverId ||
              selectedDriverId === van.driverId ||
              reassigningStopId !== null
            }
          >
            {reassigningStopId ? "Reassigning..." : "Move Stop"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default RouteDrawer;
