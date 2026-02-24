import React, { useState, useMemo, useEffect } from "react";
import { X, Truck, ExternalLink, Printer, Copy } from "lucide-react";
import type { VanRoute, VanId } from "@/context/DeliveryRuns";
import { DEPOT_LOCATION, getVanStyleKey } from "@/context/DeliveryRuns";
import { Button } from "@/components/common";
import { getDepotLocation } from "@/context/DeliveryRuns";
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
    </>
  );
};

export default RouteDrawer;
