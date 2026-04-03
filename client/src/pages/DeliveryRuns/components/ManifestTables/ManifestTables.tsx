import React, { useMemo, useState } from "react";
import { Truck, ChevronDown, ChevronUp } from "lucide-react";
import {
  type VanRoute,
  type VanId,
  getVanStyleKey,
  formatManifestItemLabel,
  formatProductNameWithSku,
} from "@/context/DeliveryRuns";
import styles from "./ManifestTables.module.css";

interface ManifestTablesProps {
  vans: VanRoute[];
}

export const ManifestTables: React.FC<ManifestTablesProps> = ({ vans }) => {
  const [expandedVans, setExpandedVans] = useState<Set<VanId>>(new Set());

  const allStock = useMemo(() => {
    const bySku = new Map<
      string,
      { skuId: string; name: string; qty: number; ordersCount?: number }
    >();

    for (const van of vans) {
      for (const item of van.manifest?.items ?? []) {
        const skuId = String((item as any)?.skuId ?? "").trim();
        const name = String((item as any)?.name ?? "").trim();
        const key = skuId || name;
        if (!key) continue;

        const prev = bySku.get(key);
        const qty = Number((item as any)?.qty ?? 0) || 0;
        const ordersCountRaw = (item as any)?.ordersCount;
        const ordersCount =
          typeof ordersCountRaw === "number" && Number.isFinite(ordersCountRaw)
            ? ordersCountRaw
            : undefined;

        if (!prev) {
          bySku.set(key, {
            skuId: skuId || "—",
            name: name || "—",
            qty,
            ...(ordersCount !== undefined ? { ordersCount } : {}),
          });
          continue;
        }

        prev.qty += qty;
        if (ordersCount !== undefined) {
          prev.ordersCount = (prev.ordersCount ?? 0) + ordersCount;
        }
      }
    }

    const rows = Array.from(bySku.values());
    rows.sort((a, b) => {
      if (a.name !== b.name) return a.name.localeCompare(b.name);
      return a.skuId.localeCompare(b.skuId);
    });
    return rows;
  }, [vans]);

  const allStockTotalQty = useMemo(
    () => allStock.reduce((sum, item) => sum + (item.qty ?? 0), 0),
    [allStock],
  );

  const toggleExpand = (vanId: VanId) => {
    setExpandedVans((prev) => {
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
      <div className={styles.summarySection}>
        <div className={styles.summaryHeader}>
          <span className={styles.summaryTitle}>Stock for delivery date</span>
          <span className={styles.itemCount}>
            {allStock.length} products • {allStockTotalQty} units
          </span>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.headerCell}>SKU</th>
                <th className={styles.headerCell}>Product</th>
                <th className={`${styles.headerCell} ${styles.ordersCell}`}>
                  Orders
                </th>
                <th className={`${styles.headerCell} ${styles.qtyCell}`}>
                  Qty
                </th>
              </tr>
            </thead>
            <tbody>
              {allStock.map((item) => (
                <tr key={`${item.skuId}-${item.name}`}>
                  <td className={`${styles.cell} ${styles.skuCell}`}>
                    {item.skuId}
                  </td>
                  <td className={`${styles.cell} ${styles.nameCell}`}>
                    {formatProductNameWithSku(item.name, item.skuId)}
                  </td>
                  <td className={`${styles.cell} ${styles.ordersCell}`}>
                    {item.ordersCount ?? "—"}
                  </td>
                  <td className={`${styles.cell} ${styles.qtyCell}`}>
                    {item.qty}
                  </td>
                </tr>
              ))}
              <tr className={styles.totalRow}>
                <td className={styles.cell}></td>
                <td className={styles.cell}>Total</td>
                <td className={`${styles.cell} ${styles.ordersCell}`}></td>
                <td className={`${styles.cell} ${styles.qtyCell}`}>
                  {allStockTotalQty}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {vans.map((van) => {
        const totalQty = van.manifest.items.reduce(
          (sum, item) => sum + item.qty,
          0,
        );
        const isExpanded = expandedVans.has(van.vanId);

        return (
          <div key={van.vanId} className={styles.vanSection}>
            <div className={styles.vanHeader}>
              <div
                className={`${styles.vanIcon} ${styles[getVanStyleKey(van.vanId)]}`}
              >
                <Truck size={16} />
              </div>
              <span className={styles.vanName}>{van.name} Manifest</span>
              <span className={styles.itemCount}>
                {van.manifest.items.length} products • {totalQty} units
              </span>
            </div>

            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.headerCell}>SKU</th>
                    <th className={styles.headerCell}>Product</th>
                    <th className={`${styles.headerCell} ${styles.ordersCell}`}>
                      Orders
                    </th>
                    <th className={`${styles.headerCell} ${styles.qtyCell}`}>
                      Qty
                    </th>
                    {/* <th className={styles.headerCell}>Unit</th> */}
                  </tr>
                </thead>
                <tbody>
                  {van.manifest.items.map((item, idx) => (
                    <tr key={`${van.vanId}-${item.skuId}-${idx}`}>
                      <td className={`${styles.cell} ${styles.skuCell}`}>
                        {item.skuId}
                      </td>
                      <td className={`${styles.cell} ${styles.nameCell}`}>
                        {formatProductNameWithSku(item.name, item.skuId)}
                      </td>
                      <td className={`${styles.cell} ${styles.ordersCell}`}>
                        {item.ordersCount ?? "—"}
                      </td>
                      <td className={`${styles.cell} ${styles.qtyCell}`}>
                        {item.qty}
                      </td>
                      {/* <td className={`${styles.cell} ${styles.unitCell}`}>
                        {item.unit || "—"}
                      </td> */}
                    </tr>
                  ))}
                  <tr className={styles.totalRow}>
                    <td className={styles.cell}></td>
                    <td className={styles.cell}>Total</td>
                    <td className={`${styles.cell} ${styles.ordersCell}`}></td>
                    <td className={`${styles.cell} ${styles.qtyCell}`}>
                      {totalQty}
                    </td>
                    {/* <td className={styles.cell}></td> */}
                  </tr>
                </tbody>
              </table>
            </div>

            {van.manifest.itemsByStop &&
              van.manifest.itemsByStop.length > 0 && (
                <>
                  <button
                    className={styles.expandBtn}
                    onClick={() => toggleExpand(van.vanId)}
                  >
                    {isExpanded ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                    {isExpanded ? "Hide" : "Show"} items by stop
                  </button>

                  {isExpanded && (
                    <div className={styles.stopManifest}>
                      {van.stops.map((stop, idx) => {
                        const stopItems =
                          van.manifest.itemsByStop?.find(
                            (s) => s.stopId === stop.stopId,
                          )?.items || [];

                        return (
                          <div
                            key={stop.stopId}
                            style={{ marginBottom: "var(--space-4)" }}
                          >
                            <div className={styles.stopTitle}>
                              <span className={styles.stopSequence}>
                                {idx + 1}
                              </span>
                              {stop.customerName} • {stop.postcode}
                            </div>
                            <div className={styles.stopItems}>
                              {stopItems.map((item, i) => (
                                <span key={i}>
                                  {item.qty}× {formatManifestItemLabel(item)}
                                  {i < stopItems.length - 1 ? ", " : ""}
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
