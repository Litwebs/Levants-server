import React, { useMemo, useRef, useState, useEffect } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useAuth } from "@/context/Auth/AuthContext";
import {
  VanRoute,
  VanId,
  RunStatus,
  DEPOT_LOCATION,
  getVanColor,
  getVanStyleKey,
} from "@/context/DeliveryRuns";
import { getDepotLocation } from "@/context/DeliveryRuns";
import { getStatusBadge } from "@/pages/Orders/order.utils";
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
}

// Create numbered marker icons
const createNumberedIcon = (number: number, color: string, filled: boolean) => {
  return L.divIcon({
    className: "custom-marker",
    html: `<div style="
      background: ${filled ? color : "var(--color-white)"};
      color: ${filled ? "#ffffff" : color};
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
      border: 2px solid ${filled ? "var(--color-gray-900)" : color};
      box-shadow: var(--shadow-sm);
    ">${number}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
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

const isDeliveredStop = (stop: VanRoute["stops"][0]) => {
  const stopStatus =
    typeof (stop as any)?.stopStatus === "string"
      ? (stop as any).stopStatus
      : undefined;
  const orderDeliveryStatus = getOrderDeliveryStatus(stop);
  const normalizedOrder =
    typeof orderDeliveryStatus === "string"
      ? orderDeliveryStatus.toLowerCase()
      : undefined;
  return stopStatus === "delivered" || normalizedOrder === "delivered";
};

// Depot icon
const depotIcon = L.divIcon({
  className: "depot-marker",
  html: `<div style="
    background: var(--color-gray-900);
    color: var(--color-white);
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: bold;
    border: 3px solid var(--color-white);
    box-shadow: var(--shadow-md);
  ">D</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18],
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
}) => {
  const { user } = useAuth();
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);

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

  return (
    <div className={styles.container}>
      {/* Van selector */}
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
                  isDeliveredStop(stop),
                )}
                ref={(marker) => {
                  if (marker) markersRef.current[stop.stopId] = marker;
                }}
                eventHandlers={{
                  click: () => handleStopClick(stop.stopId),
                }}
              >
                <Popup>
                  <div className={styles.popupTitle}>{stop.customerName}</div>
                  <div className={styles.popupDetail}>{stop.addressLine1}</div>
                  <div className={styles.popupDetail}>{stop.postcode}</div>
                  <div className={styles.popupDetail}>
                    Order: {stop.orderId}
                  </div>
                  <div className={styles.popupDetail}>
                    Delivery status:{" "}
                    {getStatusBadge(
                      (
                        getOrderDeliveryStatus(stop) ||
                        stopStatusLabel(stop, runStatus)
                      )
                        .toLowerCase()
                        .replace(/\s+/g, " "),
                    )}
                  </div>
                  {stop.phone && (
                    <div className={styles.popupDetail}>{stop.phone}</div>
                  )}
                  <div className={styles.popupDetail}>
                    ETA: {formatEtaTime(getStopEta(stop)) ?? "—"}
                  </div>
                  <div className={styles.popupItems}>
                    {stop.items.slice(0, 3).map((item, i) => (
                      <div key={i}>
                        {item.qty}x {item.name}
                      </div>
                    ))}
                    {stop.items.length > 3 && (
                      <div>+{stop.items.length - 3} more items</div>
                    )}
                  </div>
                </Popup>
              </Marker>
            )),
          )}
        </MapContainer>
      </div>

      {/* Stops list */}
      <div className={styles.stopsList}>
        <div className={styles.stopsHeader}>Stops ({displayStops.length})</div>
        <div className={styles.stopsScroll}>
          {displayStops.length === 0 ? (
            <div className={styles.emptyStops}>No stops to display</div>
          ) : (
            displayStops.map(({ vanId, stop }) => (
              <div
                key={stop.stopId}
                className={`${styles.stopItem} ${activeStop === stop.stopId ? styles.active : ""}`}
                onClick={() => handleStopClick(stop.stopId)}
              >
                <span
                  className={`${styles.stopSequence} ${styles[vanId.replace("-", "")]}`}
                >
                  {stop.sequence}
                </span>
                <span className={styles.stopName}>{stop.customerName}</span>
                <div className={styles.stopPostcode}>{stop.postcode}</div>
                <div className={styles.stopMetaRow}>
                  <span className={styles.stopMetaLabel}>Status</span>
                  {getStatusBadge(
                    (
                      getOrderDeliveryStatus(stop) ||
                      stopStatusLabel(stop, runStatus)
                    )
                      .toLowerCase()
                      .replace(/\s+/g, " "),
                  )}
                </div>
                <div className={styles.stopMetaRow}>
                  <span className={styles.stopMetaLabel}>ETA</span>
                  <span>{formatEtaTime(getStopEta(stop)) ?? "—"}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default MapView;
