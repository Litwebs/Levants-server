import React, { useMemo, useRef, useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  ExternalLink,
  Loader2,
  Pencil,
  Clock,
  Phone,
  MapPin,
  Package,
} from "lucide-react";
import { useAuth } from "@/context/Auth/AuthContext";
import { useToast } from "@/components/common/Toast";
import { useOrdersApi } from "@/context/Orders";
import { usePermissions } from "@/hooks/usePermissions";
import OrderStatusModal from "@/pages/Orders/OrderStatusModal";
import { Button, Modal, ModalFooter } from "@/components/common";
import {
  VanRoute,
  VanId,
  RunStatus,
  DEPOT_LOCATION,
  getDepotLocation,
  getVanColor,
  getVanStyleKey,
  formatManifestItemSku,
} from "@/context/DeliveryRuns";
import { getPaymentBadge, getStatusBadge } from "@/pages/Orders/order.utils";
import styles from "./MapView.module.css";

const LIGHT_TILES_URL =
  "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const DARK_TILES_URL =
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILES_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Fix for default marker icons in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

interface MapViewProps {
  vans: VanRoute[];
  selectedVan: VanId | "all";
  onSelectVan: (vanId: VanId | "all") => void;
  onSelectStop?: (stopId: string) => void;
  activeStopId?: string;
  runStatus?: RunStatus;
  hideVanSelector?: boolean;
}

// Create numbered marker icons
const createNumberedIcon = (number: number, color: string, filled: boolean) => {
  // CSS custom properties don't resolve inside Leaflet divIcon HTML strings,
  // so we use resolved hex values that match the theme palette.
  const bg = filled ? color : "#ffffff";
  const fg = filled ? "#ffffff" : color;
  // Darken the colour slightly for the border to give a crisp outline.
  const border = filled ? "rgba(0,0,0,0.25)" : color;

  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      background: ${bg};
      color: ${fg};
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 700;
      border: 2.5px solid ${border};
      box-shadow: 0 2px 6px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      letter-spacing: -0.5px;
    ">${number}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

const formatEtaTime = (iso?: string) => {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

const getOrderDeliveryStatus = (stop: VanRoute["stops"][0]) => {
  const candidate =
    (stop as any)?.orderDeliveryStatus ??
    (stop as any)?.deliveryStatus ??
    (stop as any)?.order?.deliveryStatus ??
    (stop as any)?.orderStatus;

  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate
    : undefined;
};

const getStopEta = (stop: VanRoute["stops"][0]) => {
  const candidate =
    (stop as any)?.eta ??
    (stop as any)?.etaTime ??
    (stop as any)?.arrivalEta ??
    (stop as any)?.order?.eta;

  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate
    : undefined;
};

const formatDeliveryStatus = (status?: string) => {
  if (!status) return "";
  const readable = status.replace(/_/g, " ").trim();
  if (!readable) return "";
  return readable.replace(/\b\w/g, (c) => c.toUpperCase());
};

const stopStatusLabel = (stop: VanRoute["stops"][0], runStatus?: RunStatus) => {
  const stopStatus =
    typeof (stop as any)?.stopStatus === "string"
      ? (stop as any).stopStatus
      : undefined;
  const orderDeliveryStatus = getOrderDeliveryStatus(stop);
  const normalizedOrder =
    typeof orderDeliveryStatus === "string"
      ? orderDeliveryStatus.toLowerCase()
      : undefined;

  if (stopStatus === "delivered" || normalizedOrder === "delivered")
    return "Delivered";
  if (stopStatus === "failed") return "Failed";
  if (runStatus === "dispatched") return "In transit";
  if (runStatus === "routed") return "Planned";
  if (runStatus === "locked") return "Ready";
  return "Pending";
};

const buildStopNavigationUrl = (stop: VanRoute["stops"][0]) => {
  const existing = (stop as any)?.navigationUrl;
  if (typeof existing === "string" && existing.trim().length > 0) {
    return existing;
  }

  const lat = Number((stop as any)?.lat);
  const lng = Number((stop as any)?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;

  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
};

const isDeliveredStop = (
  stop: VanRoute["stops"][0],
  orderDeliveryStatusOverride?: string,
) => {
  const stopStatus =
    typeof (stop as any)?.stopStatus === "string"
      ? (stop as any).stopStatus
      : undefined;
  const orderDeliveryStatus =
    typeof orderDeliveryStatusOverride === "string"
      ? orderDeliveryStatusOverride
      : getOrderDeliveryStatus(stop);
  const normalizedOrder =
    typeof orderDeliveryStatus === "string"
      ? orderDeliveryStatus.toLowerCase()
      : undefined;
  return stopStatus === "delivered" || normalizedOrder === "delivered";
};

// Depot icon — uses theme primary colour (#1a5f4a) as the fill
const depotIcon = L.divIcon({
  className: "depot-marker",
  html: `<div style="
    background: #1a5f4a;
    color: #ffffff;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    border: 3px solid #ffffff;
    box-shadow: 0 3px 8px rgba(0,0,0,0.55), 0 0 0 1.5px rgba(26,95,74,0.6);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    letter-spacing: -0.5px;
  ">D</div>`,
  iconSize: [38, 38],
  iconAnchor: [19, 19],
  popupAnchor: [0, -19],
});

// Fit bounds component
const FitBounds: React.FC<{ bounds: L.LatLngBoundsExpression }> = ({
  bounds,
}) => {
  const map = useMap();

  useEffect(() => {
    try {
      if (bounds && map && typeof map.fitBounds === "function") {
        map.fitBounds(bounds, { padding: [30, 30] });
      }
    } catch (err) {
      console.warn("MapView: fitBounds failed", err);
    }
  }, [map, bounds]);

  return null;
};

const InvalidateMapSize: React.FC<{ nonce: number }> = ({ nonce }) => {
  const map = useMap();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const raf = window.requestAnimationFrame(() => {
      try {
        map.invalidateSize();
      } catch (err) {
        console.warn("MapView: invalidateSize failed", err);
      }
    });

    return () => window.cancelAnimationFrame(raf);
  }, [map, nonce]);

  return null;
};

const ActiveStopController: React.FC<{
  activeStopId: string | null;
  stopLookup: Map<string, { lat: number; lng: number }>;
  markersRef: React.MutableRefObject<Record<string, L.Marker | undefined>>;
}> = ({ activeStopId, stopLookup, markersRef }) => {
  const map = useMap();

  useEffect(() => {
    if (!activeStopId) return;
    const coords = stopLookup.get(activeStopId);
    if (!coords) return;

    try {
      const targetZoom = Math.max(map.getZoom(), 14);
      map.flyTo([coords.lat, coords.lng], targetZoom, {
        animate: true,
        duration: 0.5,
      });

      const marker = markersRef.current[activeStopId];
      if (marker && typeof marker.openPopup === "function") {
        marker.openPopup();
      }
    } catch (err) {
      console.warn("MapView: active stop focus failed", err);
    }
  }, [activeStopId, map, stopLookup, markersRef]);

  return null;
};

export const MapView: React.FC<MapViewProps> = ({
  vans,
  selectedVan,
  onSelectVan,
  onSelectStop,
  activeStopId,
  runStatus,
  hideVanSelector = false,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { listOrders, updateOrderStatus, updateOrderPaymentStatus } =
    useOrdersApi();
  const { hasPermission } = usePermissions();

  const roleName =
    typeof (user as any)?.role === "string"
      ? String((user as any).role)
      : String((user as any)?.role?.name || "");
  const isDriver =
    roleName.toLowerCase() === "driver" ||
    (hasPermission("delivery.routes.read") &&
      !hasPermission("delivery.routes.update"));

  const [isStackedLayout, setIsStackedLayout] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(max-width: 1024px)");
    const apply = () => setIsStackedLayout(!!media.matches);
    apply();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }

    // Safari fallback
    media.addListener(apply);
    return () => media.removeListener(apply);
  }, []);

  const RESIZER_HEIGHT = 10;
  const MIN_STOPS_HEIGHT = 160;
  const MIN_MAP_HEIGHT = 180;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [stopsPanelHeight, setStopsPanelHeight] = useState<number>(() => {
    if (typeof window === "undefined") return 280;
    try {
      const raw =
        window.localStorage.getItem("levants:driverStopsHeight") ??
        window.localStorage.getItem("levants:stopsHeight");
      const num = raw ? Number(raw) : NaN;
      return Number.isFinite(num) && num > 0 ? num : 280;
    } catch {
      return 280;
    }
  });
  const stopsPanelHeightRef = useRef(stopsPanelHeight);
  useEffect(() => {
    stopsPanelHeightRef.current = stopsPanelHeight;
  }, [stopsPanelHeight]);
  const resizeDragRef = useRef<{
    startY: number;
    startStopsHeight: number;
    containerHeight: number;
  } | null>(null);

  const isResizableStopsLayout = hideVanSelector && isStackedLayout;

  const clampStopsHeight = (next: number) => {
    const containerHeight =
      containerRef.current?.getBoundingClientRect().height ?? 0;
    const maxStopsHeight = containerHeight
      ? Math.max(
          MIN_STOPS_HEIGHT,
          containerHeight - RESIZER_HEIGHT - MIN_MAP_HEIGHT,
        )
      : 520;
    return Math.min(Math.max(next, MIN_STOPS_HEIGHT), maxStopsHeight);
  };

  const clampStopsHeightWithContainer = (
    containerHeight: number,
    next: number,
  ) => {
    const safeHeight = Number.isFinite(containerHeight) ? containerHeight : 0;
    const maxStopsHeight = safeHeight
      ? Math.max(MIN_STOPS_HEIGHT, safeHeight - RESIZER_HEIGHT - MIN_MAP_HEIGHT)
      : 520;
    return Math.min(Math.max(next, MIN_STOPS_HEIGHT), maxStopsHeight);
  };

  const persistStopsHeight = (value: number) => {
    try {
      window.localStorage.setItem(
        "levants:driverStopsHeight",
        String(Math.round(value)),
      );
    } catch {
      // ignore
    }
  };

  const handleResizerPointerDown: React.PointerEventHandler<HTMLDivElement> = (
    e,
  ) => {
    if (!isResizableStopsLayout) return;
    if (!containerRef.current) return;

    // Prevent the page from scrolling while dragging (mobile/touch).
    try {
      e.preventDefault();
    } catch {
      // ignore
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    const rect = containerRef.current.getBoundingClientRect();
    resizeDragRef.current = {
      startY: e.clientY,
      startStopsHeight: stopsPanelHeight,
      containerHeight: rect.height,
    };

    const onMove = (ev: PointerEvent) => {
      const drag = resizeDragRef.current;
      if (!drag) return;
      const deltaY = ev.clientY - drag.startY;
      const nextStopsHeight = clampStopsHeightWithContainer(
        drag.containerHeight,
        drag.startStopsHeight - deltaY,
      );
      setStopsPanelHeight(nextStopsHeight);
      setMapSizeNonce((n) => n + 1);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      resizeDragRef.current = null;
      persistStopsHeight(stopsPanelHeightRef.current);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const [statusResolveStopId, setStatusResolveStopId] = useState<string | null>(
    null,
  );
  const [statusStopId, setStatusStopId] = useState<string | null>(null);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [selectedOrderForStatus, setSelectedOrderForStatus] = useState<{
    id: string;
    orderNumber: string;
    deliveryStatus: string;
  } | null>(null);
  const [deliveryStatusOverrides, setDeliveryStatusOverrides] = useState<
    Record<string, string>
  >({});
  const [paymentStatusOverrides, setPaymentStatusOverrides] = useState<
    Record<string, string>
  >({});
  const [paymentUpdateStopId, setPaymentUpdateStopId] = useState<string | null>(
    null,
  );
  const [paymentConfirmStop, setPaymentConfirmStop] = useState<
    VanRoute["stops"][0] | null
  >(null);
  const [paymentConfirmNextPaid, setPaymentConfirmNextPaid] = useState<
    boolean | null
  >(null);
  const [paymentMode, setPaymentMode] = useState<"full" | "custom">("full");
  const [customPayAmount, setCustomPayAmount] = useState<string>("");
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  const [mapSizeNonce, setMapSizeNonce] = useState(0);

  useEffect(() => {
    if (!isResizableStopsLayout) return;
    setMapSizeNonce((n) => n + 1);
  }, [isResizableStopsLayout, stopsPanelHeight]);

  const themePreference =
    (user as any)?.preferences?.theme === "light" ||
    (user as any)?.preferences?.theme === "dark" ||
    (user as any)?.preferences?.theme === "system"
      ? ((user as any).preferences.theme as "light" | "dark" | "system")
      : "system";

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setSystemPrefersDark(!!media.matches);
    apply();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }

    // Safari fallback
    media.addListener(apply);
    return () => media.removeListener(apply);
  }, []);

  const resolvedTheme =
    themePreference === "system"
      ? systemPrefersDark
        ? "dark"
        : "light"
      : themePreference;

  const isDark = resolvedTheme === "dark";
  const [activeStop, setActiveStop] = useState<string | null>(
    activeStopId || null,
  );
  const markersRef = useRef<Record<string, L.Marker | undefined>>({});
  const [depot, setDepot] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(null);

  useEffect(() => {
    if (typeof activeStopId === "string") setActiveStop(activeStopId);
  }, [activeStopId]);

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

  const depotLat = depot?.lat ?? DEPOT_LOCATION.lat;
  const depotLng = depot?.lng ?? DEPOT_LOCATION.lng;
  const depotLabel = depot?.label ?? DEPOT_LOCATION.label;

  const getEffectiveDeliveryStatus = (stop: VanRoute["stops"][0]) => {
    const override = deliveryStatusOverrides[stop.stopId];
    if (typeof override === "string" && override.trim().length > 0)
      return override;
    return getOrderDeliveryStatus(stop);
  };

  const getEffectivePaymentStatus = (stop: VanRoute["stops"][0]) => {
    const override = paymentStatusOverrides[stop.stopId];
    if (typeof override === "string" && override.trim().length > 0)
      return override;

    const candidate =
      (stop as any)?.orderPaymentStatus ??
      (stop as any)?.paymentStatus ??
      (stop as any)?.order?.status;

    return typeof candidate === "string" && candidate.trim().length > 0
      ? candidate
      : undefined;
  };

  const canTogglePaymentForStop = (stop: VanRoute["stops"][0]) => {
    const canUpdatePayment =
      hasPermission("orders.update") || hasPermission("orders.payment.update");
    if (!canUpdatePayment) return false;

    const isManualImport = Boolean((stop as any)?.orderIsManualImport);
    const isStripeBacked = Boolean((stop as any)?.orderIsStripeBacked);
    if (!isManualImport || isStripeBacked) return false;

    const status = String(getEffectivePaymentStatus(stop) ?? "").toLowerCase();
    if (["refund_pending", "partially_refunded", "refunded"].includes(status))
      return false;

    return Boolean((stop as any)?.orderDbId || (stop as any)?.orderId);
  };

  const handleTogglePaymentForStop = async (
    stop: VanRoute["stops"][0],
    nextPaidOverride?: boolean,
    amountPaid?: number,
  ) => {
    if (!canTogglePaymentForStop(stop)) return;
    if (paymentUpdateStopId) return;

    const current = String(
      getEffectivePaymentStatus(stop) ?? "unpaid",
    ).toLowerCase();
    const nextPaid =
      typeof nextPaidOverride === "boolean"
        ? nextPaidOverride
        : current !== "paid";

    setPaymentUpdateStopId(stop.stopId);
    try {
      const orderDbId = await resolveOrderIdForStop(stop);
      if (!orderDbId) {
        showToast({
          type: "error",
          title: "Could not find order for this stop",
        });
        return;
      }

      await updateOrderPaymentStatus(orderDbId, nextPaid, amountPaid);
      const stopTotal = Number((stop as any)?.orderTotal) || 0;
      const isPartial =
        nextPaid &&
        amountPaid !== undefined &&
        stopTotal > 0 &&
        amountPaid < stopTotal;
      setPaymentStatusOverrides((prev) => ({
        ...prev,
        [stop.stopId]: isPartial
          ? "partially_paid"
          : nextPaid
            ? "paid"
            : "unpaid",
      }));
      showToast({
        type: "success",
        title: isPartial
          ? "Marked as partially paid"
          : nextPaid
            ? "Marked as paid"
            : "Marked as unpaid",
      });
    } catch {
      showToast({ type: "error", title: "Failed to update payment status" });
    } finally {
      setPaymentUpdateStopId(null);
    }
  };

  const openPaymentConfirmForStop = (stop: VanRoute["stops"][0]) => {
    if (!canTogglePaymentForStop(stop)) return;
    if (paymentUpdateStopId) return;

    const current = String(
      getEffectivePaymentStatus(stop) ?? "unpaid",
    ).toLowerCase();
    const nextPaid = current !== "paid";

    setPaymentMode("full");
    setCustomPayAmount("");
    setPaymentConfirmStop(stop);
    setPaymentConfirmNextPaid(nextPaid);
  };

  const resolveOrderIdForStop = async (stop: VanRoute["stops"][0]) => {
    const direct = (stop as any)?.orderDbId || (stop as any)?.order?._id;
    if (typeof direct === "string" && direct.trim().length > 0) return direct;

    // Fallback: search orders by order number (ORD-...) and find an exact match.
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
      showToast({
        type: "info",
        title: "Delivered orders are locked",
      });
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

      setStatusStopId(stop.stopId);
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
    const prev = String(selectedOrderForStatus?.deliveryStatus || "");
    if (
      isDriver &&
      prev.toLowerCase() === "delivered" &&
      String(nextStatus).toLowerCase() !== "delivered"
    ) {
      showToast({
        type: "error",
        title: "Delivered orders are locked",
      });
      return;
    }

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

      if (statusStopId) {
        setDeliveryStatusOverrides((prev) => ({
          ...prev,
          [statusStopId]: nextStatus,
        }));
      }

      setIsStatusModalOpen(false);
    } catch {
      showToast({ type: "error", title: "Failed to update status" });
    }
  };

  // Get stops to display based on selection
  const displayVans = useMemo(() => {
    if (selectedVan === "all") return vans;
    return vans.filter((v) => v.vanId === selectedVan);
  }, [vans, selectedVan]);

  // Calculate bounds
  const bounds = useMemo(() => {
    try {
      const allPoints: L.LatLng[] = [L.latLng(depotLat, depotLng)];

      displayVans.forEach((van) => {
        van.stops.forEach((stop) => {
          allPoints.push(L.latLng(stop.lat, stop.lng));
        });
      });

      if (allPoints.length <= 1) return null;
      return L.latLngBounds(allPoints);
    } catch (err) {
      console.warn("MapView: bounds calculation failed", err);
      return null;
    }
  }, [displayVans, depotLat, depotLng]);

  const handleStopClick = (stopId: string) => {
    setActiveStop(stopId);
    onSelectStop?.(stopId);
  };

  const stopLookup = useMemo(() => {
    const lookup = new Map<string, { lat: number; lng: number }>();
    displayVans.forEach((van) => {
      van.stops.forEach((stop) => {
        lookup.set(stop.stopId, { lat: stop.lat, lng: stop.lng });
      });
    });
    return lookup;
  }, [displayVans]);

  // Get stops list for sidebar
  const displayStops = useMemo(() => {
    const stops: { vanId: VanId; stop: VanRoute["stops"][0] }[] = [];
    displayVans.forEach((van) => {
      van.stops.forEach((stop) => {
        stops.push({ vanId: van.vanId, stop });
      });
    });
    return stops.sort((a, b) => {
      if (a.vanId !== b.vanId) return a.vanId.localeCompare(b.vanId);
      return a.stop.sequence - b.stop.sequence;
    });
  }, [displayVans]);

  const containerClass = hideVanSelector
    ? styles.containerNoVanSelector
    : styles.container;

  const containerStyle: React.CSSProperties | undefined = hideVanSelector
    ? isResizableStopsLayout
      ? {
          height: "100%",
          minHeight: 0,
          gridTemplateRows: `minmax(${MIN_MAP_HEIGHT}px, 1fr) ${RESIZER_HEIGHT}px ${clampStopsHeight(stopsPanelHeight)}px`,
        }
      : {
          height: "100%",
          minHeight: 0,
        }
    : undefined;

  return (
    <div ref={containerRef} className={containerClass} style={containerStyle}>
      {/* Van selector */}
      {!hideVanSelector && (
        <div className={styles.vanSelector}>
          <div className={styles.vanSelectorTitle}>Select Van</div>
          <button
            className={`${styles.vanButton} ${selectedVan === "all" ? styles.active : ""}`}
            onClick={() => onSelectVan("all")}
          >
            All Vans
          </button>
          {vans.map((van) => (
            <button
              key={van.vanId}
              className={`${styles.vanButton} ${selectedVan === van.vanId ? styles.active : ""}`}
              onClick={() => onSelectVan(van.vanId)}
            >
              <span
                className={`${styles.vanDot} ${styles[getVanStyleKey(van.vanId)]}`}
              />
              {van.name}
            </button>
          ))}
        </div>
      )}

      {/* Map */}
      <div className={styles.mapContainer}>
        <MapContainer
          center={[depotLat, depotLng]}
          zoom={12}
          className={styles.map}
          scrollWheelZoom={true}
        >
          <TileLayer
            key={isDark ? "tiles-dark" : "tiles-light"}
            attribution={TILES_ATTRIBUTION}
            url={isDark ? DARK_TILES_URL : LIGHT_TILES_URL}
          />

          <InvalidateMapSize nonce={mapSizeNonce} />

          {/* Fit bounds when data changes */}
          {bounds && <FitBounds bounds={bounds} />}

          {/* Focus selected stop from sidebar */}
          <ActiveStopController
            activeStopId={activeStop}
            stopLookup={stopLookup}
            markersRef={markersRef}
          />

          {/* Depot marker */}
          <Marker position={[depotLat, depotLng]} icon={depotIcon}>
            <Popup>
              <div className={styles.popupTitle}>{depotLabel}</div>
              <div className={styles.popupDetail}>Delivery Start Point</div>
            </Popup>
          </Marker>

          {/* Stop markers */}
          {displayVans.map((van) =>
            van.stops.map((stop) => (
              <Marker
                key={stop.stopId}
                position={[stop.lat, stop.lng]}
                icon={createNumberedIcon(
                  stop.sequence,
                  getVanColor(van.vanId),
                  isDeliveredStop(stop, getEffectiveDeliveryStatus(stop)),
                )}
                ref={(marker) => {
                  if (marker) markersRef.current[stop.stopId] = marker;
                }}
                eventHandlers={{
                  click: () => handleStopClick(stop.stopId),
                }}
              >
                <Popup>
                  <div className={styles.popup}>
                    {/* Header */}
                    <div
                      className={styles.popupHeader}
                      style={{ borderLeftColor: getVanColor(van.vanId) }}
                    >
                      <div className={styles.popupName}>
                        {stop.customerName}
                      </div>
                      <div className={styles.popupAddress}>
                        <MapPin size={11} />
                        {stop.addressLine1}, {stop.postcode}
                      </div>
                    </div>

                    {/* Body */}
                    <div className={styles.popupBody}>
                      {/* Order + ETA row */}
                      <div className={styles.popupMeta}>
                        <span className={styles.popupOrderTag}>
                          #{stop.orderId}
                        </span>
                        {formatEtaTime(getStopEta(stop)) && (
                          <span className={styles.popupEta}>
                            <Clock size={11} />
                            ETA {formatEtaTime(getStopEta(stop))}
                          </span>
                        )}
                      </div>

                      {/* Phone */}
                      {stop.phone && (
                        <div className={styles.popupPhone}>
                          <Phone size={11} />
                          {stop.phone}
                        </div>
                      )}

                      {/* Delivery status */}
                      <div className={styles.popupStatusRow}>
                        {getStatusBadge(
                          (
                            getEffectiveDeliveryStatus(stop) ||
                            stopStatusLabel(stop, runStatus)
                          )
                            .toLowerCase()
                            .replace(/\s+/g, " "),
                        )}
                      </div>

                      {/* Notes */}
                      {stop.notes && (
                        <div className={styles.popupNotes}>{stop.notes}</div>
                      )}

                      {/* Items */}
                      {stop.items.length > 0 && (
                        <div className={styles.popupItems}>
                          <div className={styles.popupItemsHeader}>
                            <Package size={11} />
                            {stop.items.reduce((s, i) => s + i.qty, 0)} items
                          </div>
                          {stop.items.map((item, i) => (
                            <div key={i} className={styles.popupItem}>
                              <span className={styles.popupItemQty}>
                                {item.qty}×
                              </span>
                              <span>{formatManifestItemSku(item)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            )),
          )}
        </MapContainer>
      </div>

      {isResizableStopsLayout && (
        <div
          className={styles.stopsResizer}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize stops list"
          onPointerDown={handleResizerPointerDown}
        />
      )}

      {/* Stops list */}
      <div
        className={styles.stopsList}
        style={isResizableStopsLayout ? { maxHeight: "none" } : undefined}
      >
        <div className={styles.stopsHeader}>Stops ({displayStops.length})</div>
        <div className={styles.stopsScroll}>
          {displayStops.length === 0 ? (
            <div className={styles.emptyStops}>No stops to display</div>
          ) : (
            displayStops.map(({ vanId, stop }) => {
              const navigationUrl = buildStopNavigationUrl(stop);
              const canUpdateOrders = hasPermission("orders.update");
              const canUpdatePayment =
                hasPermission("orders.update") ||
                hasPermission("orders.payment.update");
              const isResolvingStatus = statusResolveStopId === stop.stopId;
              const isUpdatingPayment = paymentUpdateStopId === stop.stopId;
              const effectiveStatus =
                getEffectiveDeliveryStatus(stop) ||
                stopStatusLabel(stop, runStatus);
              const effectivePaymentStatus = getEffectivePaymentStatus(stop);
              const isStatusLocked =
                isDriver &&
                isDeliveredStop(stop, String(effectiveStatus).toLowerCase());
              const canTogglePayment = canTogglePaymentForStop(stop);

              return (
                <div
                  key={stop.stopId}
                  className={`${styles.stopItem} ${activeStop === stop.stopId ? styles.active : ""}`}
                  onClick={() => handleStopClick(stop.stopId)}
                >
                  <div className={styles.stopHeaderRow}>
                    <span
                      className={`${styles.stopSequence} ${styles[vanId.replace("-", "")]}`}
                    >
                      {stop.sequence}
                    </span>
                    <span className={styles.stopName}>{stop.customerName}</span>
                    <span className={styles.stopEtaTop}>
                      {formatEtaTime(getStopEta(stop)) ?? "—"}
                    </span>
                  </div>
                  <div className={styles.stopPostcode}>{stop.postcode}</div>
                  {stop.notes && (
                    <div className={styles.stopPostcode}>📝 {stop.notes}</div>
                  )}
                  <div className={styles.stopMetaRow}>
                    <span className={styles.stopMetaLabel}>Total</span>
                    <span className={styles.stopTotalValue}>
                      {typeof (stop as any)?.orderTotal === "number" &&
                      Number.isFinite((stop as any).orderTotal)
                        ? `£${Number((stop as any).orderTotal).toFixed(2)}`
                        : "—"}
                    </span>
                  </div>
                  <div className={styles.stopMetaRow}>
                    <span className={styles.stopMetaLabel}>Status</span>
                    {getStatusBadge(
                      effectiveStatus.toLowerCase().replace(/\s+/g, " "),
                    )}
                  </div>
                  <div className={styles.stopMetaRow}>
                    <span className={styles.stopMetaLabel}>Payment</span>
                    {getPaymentBadge(
                      String(effectivePaymentStatus || "unpaid").toLowerCase(),
                    )}
                  </div>

                  {(canUpdateOrders || canUpdatePayment || navigationUrl) && (
                    <div className={styles.stopActionsRow}>
                      <div className={styles.stopActions}>
                        {canUpdateOrders && (
                          <button
                            type="button"
                            className={styles.statusBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              void openStatusModalForStop(stop);
                            }}
                            disabled={isResolvingStatus || isStatusLocked}
                            title={
                              isStatusLocked
                                ? "Delivered orders are locked"
                                : "Edit delivery status"
                            }
                          >
                            {isResolvingStatus ? (
                              <Loader2
                                size={14}
                                className={styles.btnSpinner}
                              />
                            ) : (
                              <Pencil size={14} />
                            )}
                            Status
                          </button>
                        )}
                        {canUpdatePayment && (
                          <button
                            type="button"
                            className={styles.statusBtn}
                            onClick={(e) => {
                              e.stopPropagation();
                              openPaymentConfirmForStop(stop);
                            }}
                            disabled={!canTogglePayment || isUpdatingPayment}
                            title="Toggle payment status"
                          >
                            {isUpdatingPayment ? (
                              <Loader2
                                size={14}
                                className={styles.btnSpinner}
                              />
                            ) : null}
                            {String(
                              effectivePaymentStatus || "unpaid",
                            ).toLowerCase() === "paid"
                              ? "Mark Unpaid"
                              : "Mark Paid"}
                          </button>
                        )}
                        {navigationUrl && (
                          <a
                            className={styles.directionsBtn}
                            href={navigationUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="Open directions in Google Maps"
                          >
                            Directions
                            <ExternalLink size={14} />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <OrderStatusModal
        selectedOrder={selectedOrderForStatus}
        isStatusModalOpen={isStatusModalOpen}
        setIsStatusModalOpen={setIsStatusModalOpen}
        updateOrderStatus={handleUpdateOrderStatus}
      />

      <Modal
        isOpen={
          Boolean(paymentConfirmStop) &&
          typeof paymentConfirmNextPaid === "boolean"
        }
        onClose={() => {
          if (!paymentUpdateStopId) {
            setPaymentConfirmStop(null);
            setPaymentConfirmNextPaid(null);
          }
        }}
        title={paymentConfirmNextPaid ? "Mark as paid" : "Mark as unpaid"}
        size="sm"
      >
        {paymentConfirmNextPaid ? (
          (() => {
            const stopTotal =
              Number((paymentConfirmStop as any)?.orderTotal) || 0;
            const parsedCustom = Number(customPayAmount);
            const customIsValid =
              customPayAmount.trim() !== "" &&
              Number.isFinite(parsedCustom) &&
              parsedCustom >= 0;
            const effectiveAmount =
              paymentMode === "full"
                ? stopTotal
                : customIsValid
                  ? parsedCustom
                  : null;
            const isPartial =
              effectiveAmount !== null &&
              stopTotal > 0 &&
              effectiveAmount < stopTotal;
            const remaining =
              effectiveAmount !== null
                ? Math.max(0, stopTotal - effectiveAmount)
                : null;

            return (
              <>
                <div style={{ marginBottom: "var(--space-3)" }}>
                  <div
                    style={{
                      fontSize: "var(--text-sm)",
                      fontWeight: "var(--font-medium)",
                      color: "var(--color-gray-700)",
                      marginBottom: "var(--space-2)",
                    }}
                  >
                    Amount received
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "var(--space-2)",
                      marginBottom: "var(--space-3)",
                    }}
                  >
                    <Button
                      size="sm"
                      variant={paymentMode === "full" ? "primary" : "outline"}
                      onClick={() => setPaymentMode("full")}
                      disabled={Boolean(paymentUpdateStopId)}
                    >
                      {stopTotal > 0
                        ? `Full — £${stopTotal.toFixed(2)}`
                        : "Full amount"}
                    </Button>
                    <Button
                      size="sm"
                      variant={paymentMode === "custom" ? "primary" : "outline"}
                      onClick={() => setPaymentMode("custom")}
                      disabled={Boolean(paymentUpdateStopId)}
                    >
                      Custom amount
                    </Button>
                  </div>
                  {paymentMode === "custom" && (
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.01}
                      placeholder={
                        stopTotal > 0
                          ? `e.g. ${(stopTotal / 2).toFixed(2)}`
                          : "Enter amount"
                      }
                      value={customPayAmount}
                      onChange={(e) => setCustomPayAmount(e.target.value)}
                      disabled={Boolean(paymentUpdateStopId)}
                      autoFocus
                      style={{
                        width: "100%",
                        padding: "var(--space-2) var(--space-3)",
                        border: "1px solid var(--color-gray-300)",
                        borderRadius: "var(--radius-md)",
                        fontSize: "var(--text-sm)",
                        background: "var(--color-white)",
                        color: "var(--color-gray-900)",
                      }}
                    />
                  )}
                  {paymentMode === "custom" && customIsValid && (
                    <p
                      style={{
                        fontSize: "var(--text-sm)",
                        marginTop: "var(--space-1)",
                        color: isPartial
                          ? "var(--color-warning-600, #b45309)"
                          : "var(--color-success-600, #16a34a)",
                      }}
                    >
                      {isPartial
                        ? `Partially paid — £${remaining!.toFixed(2)} outstanding`
                        : "Paid in full"}
                    </p>
                  )}
                </div>
              </>
            );
          })()
        ) : (
          <p>
            Mark order {(paymentConfirmStop as any)?.orderId || ""} as unpaid?
          </p>
        )}

        <ModalFooter>
          <Button
            variant="outline"
            disabled={Boolean(paymentUpdateStopId)}
            onClick={() => {
              setPaymentConfirmStop(null);
              setPaymentConfirmNextPaid(null);
            }}
          >
            Cancel
          </Button>
          <Button
            disabled={(() => {
              if (
                Boolean(paymentUpdateStopId) ||
                !paymentConfirmStop ||
                typeof paymentConfirmNextPaid !== "boolean"
              )
                return true;
              if (paymentConfirmNextPaid && paymentMode === "custom") {
                const v = Number(customPayAmount);
                return (
                  customPayAmount.trim() === "" || !Number.isFinite(v) || v < 0
                );
              }
              return false;
            })()}
            isLoading={Boolean(paymentUpdateStopId)}
            onClick={async () => {
              if (!paymentConfirmStop) return;
              if (typeof paymentConfirmNextPaid !== "boolean") return;
              let amountPaid: number | undefined;
              if (paymentConfirmNextPaid && paymentMode === "custom") {
                amountPaid = Number(customPayAmount);
              }
              await handleTogglePaymentForStop(
                paymentConfirmStop,
                paymentConfirmNextPaid,
                amountPaid,
              );
              setPaymentConfirmStop(null);
              setPaymentConfirmNextPaid(null);
            }}
          >
            Confirm
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default MapView;
