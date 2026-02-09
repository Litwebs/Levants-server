import React, { useState } from 'react';
import { Truck, ChevronDown, ChevronUp } from 'lucide-react';
import { VanRoute, VanId } from '../../types';
import styles from './ManifestTables.module.css';

interface ManifestTablesProps {
  vans: VanRoute[];
}

const VAN_ICONS: Record<VanId, string> = {
  'van-1': styles.van1,
  'van-2': styles.van2,
  'van-3': styles.van3
};

export const ManifestTables: React.FC<ManifestTablesProps> = ({ vans }) => {
  const [expandedVans, setExpandedVans] = useState<Set<VanId>>(new Set());

  const toggleExpand = (vanId: VanId) => {
    setExpandedVans(prev => {
      const next = new Set(prev);
      if (next.has(vanId)) {
        next.delete(vanId);
      } else {
        next.add(vanId);
      }
      return next;
    });
  };

  if (vans.length === 0) {
    return (
      <div className={styles.emptyState}>
        No manifest data available. Generate routes first.
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {vans.map(van => {
        const totalQty = van.manifest.items.reduce((sum, item) => sum + item.qty, 0);
        const isExpanded = expandedVans.has(van.vanId);

        return (
          <div key={van.vanId} className={styles.vanSection}>
            <div className={styles.vanHeader}>
              <div className={`${styles.vanIcon} ${VAN_ICONS[van.vanId]}`}>
                <Truck size={16} />
              </div>
              <span className={styles.vanName}>{van.name} Manifest</span>
              <span className={styles.itemCount}>
                {van.manifest.items.length} products • {totalQty} units
              </span>
            </div>

            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.headerCell}>SKU</th>
                  <th className={styles.headerCell}>Product</th>
                  <th className={`${styles.headerCell} ${styles.qtyCell}`}>Qty</th>
                  <th className={styles.headerCell}>Unit</th>
                </tr>
              </thead>
              <tbody>
                {van.manifest.items.map((item, idx) => (
                  <tr key={`${van.vanId}-${item.skuId}-${idx}`}>
                    <td className={`${styles.cell} ${styles.skuCell}`}>{item.skuId}</td>
                    <td className={`${styles.cell} ${styles.nameCell}`}>{item.name}</td>
                    <td className={`${styles.cell} ${styles.qtyCell}`}>{item.qty}</td>
                    <td className={`${styles.cell} ${styles.unitCell}`}>{item.unit || '—'}</td>
                  </tr>
                ))}
                <tr className={styles.totalRow}>
                  <td className={styles.cell}></td>
                  <td className={styles.cell}>Total</td>
                  <td className={`${styles.cell} ${styles.qtyCell}`}>{totalQty}</td>
                  <td className={styles.cell}></td>
                </tr>
              </tbody>
            </table>

            {van.manifest.itemsByStop && van.manifest.itemsByStop.length > 0 && (
              <>
                <button 
                  className={styles.expandBtn}
                  onClick={() => toggleExpand(van.vanId)}
                >
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  {isExpanded ? 'Hide' : 'Show'} items by stop
                </button>

                {isExpanded && (
                  <div className={styles.stopManifest}>
                    {van.stops.map((stop, idx) => {
                      const stopItems = van.manifest.itemsByStop?.find(
                        s => s.stopId === stop.stopId
                      )?.items || [];
                      
                      return (
                        <div key={stop.stopId} style={{ marginBottom: 'var(--space-4)' }}>
                          <div className={styles.stopTitle}>
                            <span className={styles.stopSequence}>{idx + 1}</span>
                            {stop.customerName} • {stop.postcode}
                          </div>
                          <div className={styles.stopItems}>
                            {stopItems.map((item, i) => (
                              <span key={i}>
                                {item.qty}× {item.name}
                                {i < stopItems.length - 1 ? ', ' : ''}
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ManifestTables;
