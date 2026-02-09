import React, { useState, useMemo } from 'react';
import { X, Truck, ExternalLink, Printer, Copy } from 'lucide-react';
import { VanRoute, VanId, DEPOT_LOCATION } from '../../types';
import { Button } from '@/components/common';
import styles from './RouteDrawer.module.css';

interface RouteDrawerProps {
  van: VanRoute;
  isOpen: boolean;
  onClose: () => void;
  onPrint: () => void;
}

const VAN_ICONS: Record<VanId, string> = {
  'van-1': styles.van1,
  'van-2': styles.van2,
  'van-3': styles.van3
};

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

export const RouteDrawer: React.FC<RouteDrawerProps> = ({
  van,
  isOpen,
  onClose,
  onPrint
}) => {
  const [search, setSearch] = useState('');

  const filteredStops = useMemo(() => {
    if (!search.trim()) return van.stops;
    
    const term = search.toLowerCase();
    return van.stops.filter(stop =>
      stop.customerName.toLowerCase().includes(term) ||
      stop.postcode.toLowerCase().includes(term) ||
      stop.orderId.toLowerCase().includes(term) ||
      stop.addressLine1.toLowerCase().includes(term)
    );
  }, [van.stops, search]);

  // Build Google Maps directions URL
  const buildMapsUrl = () => {
    const origin = `${DEPOT_LOCATION.lat},${DEPOT_LOCATION.lng}`;
    const destination = van.stops.length > 0 
      ? `${van.stops[van.stops.length - 1].lat},${van.stops[van.stops.length - 1].lng}`
      : origin;
    
    // Google Maps has a limit of ~25 waypoints
    const waypoints = van.stops
      .slice(0, -1)
      .slice(0, 23)
      .map(s => `${s.lat},${s.lng}`)
      .join('|');
    
    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    if (waypoints) {
      url += `&waypoints=${waypoints}`;
    }
    
    return url;
  };

  const handleOpenMaps = () => {
    window.open(buildMapsUrl(), '_blank');
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
          <div className={`${styles.vanIcon} ${VAN_ICONS[van.vanId]}`}>
            <Truck size={20} />
          </div>
          <div className={styles.headerInfo}>
            <div className={styles.title}>{van.name} Route</div>
            <div className={styles.subtitle}>
              {van.stats.stops} stops • {van.stats.distanceKm} km • {formatDuration(van.stats.durationMin)}
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
            <div className={styles.emptySearch}>
              No stops match your search
            </div>
          ) : (
            filteredStops.map((stop) => (
              <div key={stop.stopId} className={styles.stop}>
                <div className={styles.stopHeader}>
                  <span className={`${styles.stopSequence} ${styles[van.vanId.replace('-', '')]}`}>
                    {stop.sequence}
                  </span>
                  <div className={styles.stopInfo}>
                    <div className={styles.stopName}>{stop.customerName}</div>
                    <div className={styles.stopAddress}>
                      {stop.addressLine1}, {stop.postcode}
                    </div>
                    <div className={styles.stopMeta}>
                      <span>Order: {stop.orderId}</span>
                      {stop.eta && <span className={styles.stopEta}>ETA: {stop.eta}</span>}
                      {stop.phone && <span>{stop.phone}</span>}
                    </div>
                    {stop.notes && (
                      <div className={styles.stopItems}>
                        📝 {stop.notes}
                      </div>
                    )}
                    <div className={styles.stopItems}>
                      {stop.items.map((item, i) => (
                        <span key={i}>
                          {item.qty}× {item.name}
                          {i < stop.items.length - 1 ? ', ' : ''}
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
          <Button variant="secondary" onClick={handleOpenMaps}>
            <ExternalLink size={16} />
            Open in Maps
          </Button>
          <Button variant="ghost" onClick={handleCopyRoute}>
            <Copy size={16} />
            Copy Link
          </Button>
          <Button variant="ghost" onClick={onPrint}>
            <Printer size={16} />
            Print
          </Button>
        </div>
      </div>
    </>
  );
};

export default RouteDrawer;
