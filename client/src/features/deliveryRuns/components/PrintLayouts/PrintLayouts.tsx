import React, { useRef } from 'react';
import { Printer, X } from 'lucide-react';
import { VanRoute, DeliveryRun } from '../../types';
import { Button, Modal, ModalFooter } from '@/components/common';
import styles from './PrintLayouts.module.css';

interface PrintLayoutProps {
  van: VanRoute;
  run: DeliveryRun;
  type: 'stops' | 'manifest';
  isOpen: boolean;
  onClose: () => void;
}

const formatDuration = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
};

export const PrintLayout: React.FC<PrintLayoutProps> = ({
  van,
  run,
  type,
  isOpen,
  onClose
}) => {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const printContent = printRef.current;
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${van.name} ${type === 'stops' ? 'Stop List' : 'Manifest'} - ${run.deliveryDate}</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
            ${styles.printContainer.replace('.printContainer', '')}
            .printHeader { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #000; }
            .printTitle { font-size: 24px; font-weight: bold; margin: 0 0 4px 0; }
            .printSubtitle { font-size: 14px; color: #666; margin: 0; }
            .printMeta { text-align: right; font-size: 12px; }
            .printStats { display: flex; gap: 24px; margin-bottom: 24px; padding: 12px; background: #f5f5f5; }
            .printStat { text-align: center; }
            .printStatValue { font-size: 20px; font-weight: bold; }
            .printStatLabel { font-size: 10px; text-transform: uppercase; color: #666; }
            .printTable { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px; }
            .printTable th { background: #333; color: white; padding: 8px; text-align: left; font-weight: 600; }
            .printTable td { padding: 8px; border-bottom: 1px solid #ddd; vertical-align: top; }
            .printTable tr:nth-child(even) { background: #f9f9f9; }
            .printSequence { width: 24px; height: 24px; border-radius: 50%; background: #333; color: white; display: inline-flex; align-items: center; justify-content: center; font-weight: bold; font-size: 11px; }
            .printItems { font-size: 10px; color: #666; margin-top: 4px; }
            .printNotes { font-size: 10px; color: #666; font-style: italic; }
            .qtyCell { text-align: right; font-weight: bold; }
            tfoot td { background: #f5f5f5; font-weight: bold; }
            .printFooter { margin-top: 24px; padding-top: 16px; border-top: 1px solid #ddd; font-size: 10px; color: #666; text-align: center; }
          </style>
        </head>
        <body>
          ${printContent.innerHTML}
        </body>
      </html>
    `);

    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);
  };

  const totalQty = van.manifest.items.reduce((sum, item) => sum + item.qty, 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Print ${type === 'stops' ? 'Stop List' : 'Manifest'}`} size="lg">
      <div className={styles.previewContainer}>
        <div className={styles.previewActions}>
          <Button variant="primary" onClick={handlePrint}>
            <Printer size={16} />
            Print
          </Button>
          <Button variant="ghost" onClick={onClose}>
            <X size={16} />
            Close
          </Button>
        </div>

        <div ref={printRef}>
          <div className={styles.printHeader}>
            <div>
              <h1 className={styles.printTitle}>
                {van.name} {type === 'stops' ? 'Stop List' : 'Manifest'}
              </h1>
              <p className={styles.printSubtitle}>
                Delivery Date: {new Date(run.deliveryDate).toLocaleDateString('en-GB', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric'
                })}
              </p>
            </div>
            <div className={styles.printMeta}>
              <div>Printed: {new Date().toLocaleString('en-GB')}</div>
              <div>Run ID: {run.id}</div>
            </div>
          </div>

          <div className={styles.printStats}>
            <div className={styles.printStat}>
              <div className={styles.printStatValue}>{van.stats.stops}</div>
              <div className={styles.printStatLabel}>Stops</div>
            </div>
            <div className={styles.printStat}>
              <div className={styles.printStatValue}>{van.stats.distanceKm} km</div>
              <div className={styles.printStatLabel}>Distance</div>
            </div>
            <div className={styles.printStat}>
              <div className={styles.printStatValue}>{formatDuration(van.stats.durationMin)}</div>
              <div className={styles.printStatLabel}>Duration</div>
            </div>
            {type === 'manifest' && (
              <div className={styles.printStat}>
                <div className={styles.printStatValue}>{totalQty}</div>
                <div className={styles.printStatLabel}>Total Items</div>
              </div>
            )}
          </div>

          {type === 'stops' ? (
            <table className={styles.printTable}>
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>#</th>
                  <th>Customer</th>
                  <th>Address</th>
                  <th>Order</th>
                  <th>ETA</th>
                  <th>Items</th>
                </tr>
              </thead>
              <tbody>
                {van.stops.map((stop) => (
                  <tr key={stop.stopId}>
                    <td>
                      <span className={styles.printSequence}>{stop.sequence}</span>
                    </td>
                    <td>
                      <strong>{stop.customerName}</strong>
                      {stop.phone && <div style={{ fontSize: '10px', color: '#666' }}>{stop.phone}</div>}
                    </td>
                    <td>
                      {stop.addressLine1}<br />
                      <strong>{stop.postcode}</strong>
                      {stop.notes && (
                        <div className={styles.printNotes}>📝 {stop.notes}</div>
                      )}
                    </td>
                    <td>{stop.orderId}</td>
                    <td>{stop.eta || '—'}</td>
                    <td>
                      {stop.items.map((item, i) => (
                        <div key={i} className={styles.printItems}>
                          {item.qty}× {item.name}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className={styles.printManifestTable}>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th className={styles.qtyCell}>Qty</th>
                  <th>Unit</th>
                </tr>
              </thead>
              <tbody>
                {van.manifest.items.map((item, idx) => (
                  <tr key={`${item.skuId}-${idx}`}>
                    <td style={{ fontFamily: 'monospace', fontSize: '11px' }}>{item.skuId}</td>
                    <td>{item.name}</td>
                    <td className={styles.qtyCell}>{item.qty}</td>
                    <td>{item.unit || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={2}><strong>Total</strong></td>
                  <td className={styles.qtyCell}><strong>{totalQty}</strong></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          )}

          <div className={styles.printFooter}>
            Levants Dairy • Delivery Run Report • Generated {new Date().toISOString()}
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default PrintLayout;
