import React, { useMemo, useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { VanRoute, VanId, DEPOT_LOCATION, VAN_COLORS, VAN_NAMES } from '../../types';
import styles from './MapView.module.css';

// Fix for default marker icons in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface MapViewProps {
  vans: VanRoute[];
  selectedVan: VanId | 'all';
  onSelectVan: (vanId: VanId | 'all') => void;
  onSelectStop?: (stopId: string) => void;
  activeStopId?: string;
}

// Create numbered marker icons
const createNumberedIcon = (number: number, color: string) => {
  return L.divIcon({
    className: 'custom-marker',
    html: `<div style="
      background: ${color};
      color: white;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
      border: 2px solid white;
      box-shadow: 0 2px 4px rgba(0,0,0,0.3);
    ">${number}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
};

// Depot icon
const depotIcon = L.divIcon({
  className: 'depot-marker',
  html: `<div style="
    background: #1f2937;
    color: white;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: bold;
    border: 3px solid white;
    box-shadow: 0 2px 6px rgba(0,0,0,0.4);
  ">D</div>`,
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18],
});

// Fit bounds component
const FitBounds: React.FC<{ bounds: L.LatLngBoundsExpression }> = ({ bounds }) => {
  const map = useMap();
  
  useEffect(() => {
    try {
      if (bounds && map && typeof map.fitBounds === 'function') {
        map.fitBounds(bounds, { padding: [30, 30] });
      }
    } catch (err) {
      console.warn('MapView: fitBounds failed', err);
    }
  }, [map, bounds]);
  
  return null;
};

export const MapView: React.FC<MapViewProps> = ({
  vans,
  selectedVan,
  onSelectVan,
  onSelectStop,
  activeStopId
}) => {
  const [activeStop, setActiveStop] = useState<string | null>(activeStopId || null);

  // Get stops to display based on selection
  const displayVans = useMemo(() => {
    if (selectedVan === 'all') return vans;
    return vans.filter(v => v.vanId === selectedVan);
  }, [vans, selectedVan]);

  // Calculate bounds
  const bounds = useMemo(() => {
    try {
      const allPoints: L.LatLng[] = [L.latLng(DEPOT_LOCATION.lat, DEPOT_LOCATION.lng)];
      
      displayVans.forEach(van => {
        van.stops.forEach(stop => {
          allPoints.push(L.latLng(stop.lat, stop.lng));
        });
      });
      
      if (allPoints.length <= 1) return null;
      return L.latLngBounds(allPoints);
    } catch (err) {
      console.warn('MapView: bounds calculation failed', err);
      return null;
    }
  }, [displayVans]);

  const handleStopClick = (stopId: string) => {
    setActiveStop(stopId);
    onSelectStop?.(stopId);
  };

  // Get stops list for sidebar
  const displayStops = useMemo(() => {
    const stops: { vanId: VanId; stop: VanRoute['stops'][0] }[] = [];
    displayVans.forEach(van => {
      van.stops.forEach(stop => {
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
          className={`${styles.vanButton} ${selectedVan === 'all' ? styles.active : ''}`}
          onClick={() => onSelectVan('all')}
        >
          All Vans
        </button>
        {vans.map(van => (
          <button
            key={van.vanId}
            className={`${styles.vanButton} ${selectedVan === van.vanId ? styles.active : ''}`}
            onClick={() => onSelectVan(van.vanId)}
          >
            <span className={`${styles.vanDot} ${styles[van.vanId.replace('-', '')]}`} />
            {van.name}
          </button>
        ))}
      </div>

      {/* Map */}
      <div className={styles.mapContainer}>
        <MapContainer
          center={[DEPOT_LOCATION.lat, DEPOT_LOCATION.lng]}
          zoom={12}
          className={styles.map}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Fit bounds when data changes */}
          {bounds && <FitBounds bounds={bounds} />}

          {/* Depot marker */}
          <Marker position={[DEPOT_LOCATION.lat, DEPOT_LOCATION.lng]} icon={depotIcon}>
            <Popup>
              <div className={styles.popupTitle}>{DEPOT_LOCATION.label}</div>
              <div className={styles.popupDetail}>Delivery Start Point</div>
            </Popup>
          </Marker>

          {/* Route polylines */}
          {displayVans.map(van => {
            const positions: [number, number][] = [
              [DEPOT_LOCATION.lat, DEPOT_LOCATION.lng],
              ...van.stops.map(s => [s.lat, s.lng] as [number, number])
            ];
            
            return (
              <Polyline
                key={`route-${van.vanId}`}
                positions={positions}
                color={VAN_COLORS[van.vanId]}
                weight={3}
                opacity={0.7}
                dashArray={van.vanId === 'van-2' ? '10, 5' : van.vanId === 'van-3' ? '5, 10' : undefined}
              />
            );
          })}

          {/* Stop markers */}
          {displayVans.map(van =>
            van.stops.map(stop => (
              <Marker
                key={stop.stopId}
                position={[stop.lat, stop.lng]}
                icon={createNumberedIcon(stop.sequence, VAN_COLORS[van.vanId])}
                eventHandlers={{
                  click: () => handleStopClick(stop.stopId)
                }}
              >
                <Popup>
                  <div className={styles.popupTitle}>{stop.customerName}</div>
                  <div className={styles.popupDetail}>{stop.addressLine1}</div>
                  <div className={styles.popupDetail}>{stop.postcode}</div>
                  <div className={styles.popupDetail}>Order: {stop.orderId}</div>
                  {stop.eta && <div className={styles.popupDetail}>ETA: {stop.eta}</div>}
                  <div className={styles.popupItems}>
                    {stop.items.slice(0, 3).map((item, i) => (
                      <div key={i}>{item.qty}x {item.name}</div>
                    ))}
                    {stop.items.length > 3 && (
                      <div>+{stop.items.length - 3} more items</div>
                    )}
                  </div>
                </Popup>
              </Marker>
            ))
          )}
        </MapContainer>
      </div>

      {/* Stops list */}
      <div className={styles.stopsList}>
        <div className={styles.stopsHeader}>
          Stops ({displayStops.length})
        </div>
        <div className={styles.stopsScroll}>
          {displayStops.length === 0 ? (
            <div className={styles.emptyStops}>No stops to display</div>
          ) : (
            displayStops.map(({ vanId, stop }) => (
              <div
                key={stop.stopId}
                className={`${styles.stopItem} ${activeStop === stop.stopId ? styles.active : ''}`}
                onClick={() => handleStopClick(stop.stopId)}
              >
                <span className={`${styles.stopSequence} ${styles[vanId.replace('-', '')]}`}>
                  {stop.sequence}
                </span>
                <span className={styles.stopName}>{stop.customerName}</span>
                <div className={styles.stopPostcode}>{stop.postcode}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default MapView;
