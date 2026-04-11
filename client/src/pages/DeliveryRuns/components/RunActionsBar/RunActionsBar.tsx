import React, { useState } from "react";
import {
  Lock,
  Unlock,
  Route,
  Truck,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import type {
  DeliveryDriver,
  DeliveryRun,
  GenerateRouteDriverConfig,
  ManualOrderAssignment,
  OrderSummary,
} from "@/context/DeliveryRuns";
import { Button, Modal, ModalFooter, Input } from "@/components/common";
import { Checkbox } from "@/components/ui/checkbox";
import { listDrivers } from "@/context/DeliveryRuns";
import styles from "./RunActionsBar.module.css";

interface RunActionsBarProps {
  run: DeliveryRun;
  actionLoading: "lock" | "unlock" | "optimize" | "dispatch" | null;
  onLock: () => Promise<boolean>;
  onUnlock: () => Promise<boolean>;
  onOptimize: (
    driverConfigs: GenerateRouteDriverConfig[],
    manualAssignments: ManualOrderAssignment[],
  ) => Promise<boolean>;
  onDispatch: () => Promise<boolean>;
}

type ConfirmAction =
  | "lock"
  | "unlock"
  | "optimize"
  | "reoptimize"
  | "dispatch"
  | null;

type DriverRoutingForm = DeliveryDriver & {
  selected: boolean;
  postcodeAreas: string[];
  routeStartTime: string;
};

type AvailableRoutingArea = {
  area: string;
  orderCount: number;
};

type ListedOrder = OrderSummary & {
  orderDbId: string;
};

const normalizeRoutingArea = (value: string) =>
  String(value || "")
    .replace(/\s+/g, "")
    .trim()
    .toUpperCase();

const extractRoutingArea = (postcode: string) => {
  const compact = normalizeRoutingArea(postcode);
  if (!compact) return "";

  const match = compact.match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  return match ? match[1] : compact;
};

const uniqueSortedAreas = (areas: string[]) =>
  Array.from(new Set(areas.map(normalizeRoutingArea).filter(Boolean))).sort(
    (a, b) => a.localeCompare(b),
  );

const collectAvailableRoutingAreas = (
  run: DeliveryRun,
): AvailableRoutingArea[] => {
  const counts = new Map<string, number>();

  for (const van of run.vans) {
    for (const stop of van.stops) {
      const area = extractRoutingArea(stop.postcode);
      if (!area) continue;
      counts.set(area, (counts.get(area) || 0) + 1);
    }
  }

  for (const order of run.unassignedOrders) {
    const area = extractRoutingArea(order.postcode);
    if (!area) continue;
    counts.set(area, (counts.get(area) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([area, orderCount]) => ({ area, orderCount }))
    .sort((a, b) => a.area.localeCompare(b.area));
};

const collectAllOrders = (run: DeliveryRun): ListedOrder[] => {
  const byId = new Map<string, ListedOrder>();

  for (const order of run.allOrders || []) {
    const orderDbId = String(order.orderDbId || "").trim();
    if (!orderDbId) continue;
    byId.set(orderDbId, { ...order, orderDbId });
  }

  for (const van of run.vans) {
    for (const stop of van.stops) {
      const orderDbId = String(stop.orderDbId || "").trim();
      if (!orderDbId || byId.has(orderDbId)) continue;

      byId.set(orderDbId, {
        orderDbId,
        orderId: stop.orderId,
        customerName: stop.customerName,
        addressLine1: stop.addressLine1,
        postcode: stop.postcode,
        routingArea: extractRoutingArea(stop.postcode),
        totalItems: Array.isArray(stop.items)
          ? stop.items.reduce((sum, item) => sum + Number(item.qty || 0), 0)
          : 0,
        lat: stop.lat,
        lng: stop.lng,
      });
    }
  }

  for (const order of run.unassignedOrders || []) {
    const orderDbId = String(order.orderDbId || "").trim();
    if (!orderDbId || byId.has(orderDbId)) continue;
    byId.set(orderDbId, { ...order, orderDbId });
  }

  return Array.from(byId.values()).sort((a, b) => {
    const postcodeCompare = String(a.postcode || "").localeCompare(
      String(b.postcode || ""),
    );
    if (postcodeCompare !== 0) return postcodeCompare;
    return String(a.orderId || "").localeCompare(String(b.orderId || ""));
  });
};

export const RunActionsBar: React.FC<RunActionsBarProps> = ({
  run,
  actionLoading,
  onLock,
  onUnlock,
  onOptimize,
  onDispatch,
}) => {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [drivers, setDrivers] = useState<DriverRoutingForm[]>([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [manualAssignments, setManualAssignments] = useState<
    Record<string, string>
  >({});
  const allOrders = collectAllOrders(run);
  const availableRoutingAreas = collectAvailableRoutingAreas(run);
  const availableAreaSet = new Set(
    availableRoutingAreas.map((entry) => entry.area),
  );
  const manualAssignmentCountByDriver = Object.values(manualAssignments).reduce(
    (counts, driverId) => {
      if (!driverId) return counts;
      counts[driverId] = (counts[driverId] || 0) + 1;
      return counts;
    },
    {} as Record<string, number>,
  );

  const toggleDriverArea = (driverId: string, area: string) => {
    const normalized = normalizeRoutingArea(area);
    setDrivers((prev) =>
      prev.map((driver) => {
        if (driver.id !== driverId) return driver;

        const exists = driver.postcodeAreas.includes(normalized);
        return {
          ...driver,
          postcodeAreas: exists
            ? driver.postcodeAreas.filter((value) => value !== normalized)
            : uniqueSortedAreas([...driver.postcodeAreas, normalized]),
        };
      }),
    );
  };

  const openConfirm = async (action: ConfirmAction) => {
    setConfirmAction(action);

    if (action === "optimize" || action === "reoptimize") {
      setManualAssignments({});
      setDriversLoading(true);
      try {
        const list = await listDrivers();
        setDrivers(
          list.map((driver) => ({
            ...driver,
            selected: true,
            postcodeAreas: uniqueSortedAreas(
              driver.driverRouting?.postcodeAreas || [],
            ),
            routeStartTime: driver.driverRouting?.routeStartTime || "",
          })),
        );
      } catch {
        setDrivers([]);
      } finally {
        setDriversLoading(false);
      }
    }
  };

  const handleConfirm = async () => {
    let success = false;
    switch (confirmAction) {
      case "lock":
        success = await onLock();
        break;
      case "unlock":
        success = await onUnlock();
        break;
      case "optimize":
      case "reoptimize":
        success = await onOptimize(
          drivers
            .filter((driver) => driver.selected)
            .map((driver) => ({
              driverId: driver.id,
              postcodeAreas: driver.postcodeAreas,
              routeStartTime: driver.routeStartTime,
            })),
          Object.entries(manualAssignments)
            .filter(([, driverId]) => Boolean(String(driverId || "").trim()))
            .map(([orderDbId, driverId]) => ({
              orderDbId,
              driverId,
            })),
        );
        break;
      case "dispatch":
        success = await onDispatch();
        break;
    }
    if (success) {
      setConfirmAction(null);
    }
  };

  const getConfirmTitle = () => {
    switch (confirmAction) {
      case "lock":
        return "Lock Delivery Run?";
      case "unlock":
        return "Unlock Delivery Run?";
      case "optimize":
        return "Optimize Routes?";
      case "reoptimize":
        return "Re-optimize Routes?";
      case "dispatch":
        return "Dispatch Delivery Run?";
      default:
        return "";
    }
  };

  const getConfirmMessage = () => {
    switch (confirmAction) {
      case "lock":
        return "Locking will prevent automatic order additions. You can unlock later if needed.";
      case "unlock":
        return "Unlocking will return this run to draft status. Routes will be preserved but may become outdated.";
      case "optimize":
        return "Select drivers, then generate optimized routes based on current orders.";
      case "reoptimize":
        return "This will regenerate all routes. Existing van assignments will be changed.";
      case "dispatch":
        return "This will mark the run as dispatched. Drivers will receive their routes.";
      default:
        return "";
    }
  };

  const canLock = run.status === "draft";
  const canUnlock = run.status === "locked" || run.status === "routed";
  const canOptimize = run.status === "locked" || run.status === "draft";
  const canReoptimize = run.status === "routed";
  const canDispatch = run.status === "routed";
  const selectedDrivers = drivers.filter((driver) => driver.selected);
  const hasInvalidSelectedDriverConfig = selectedDrivers.some(
    (driver) =>
      !driver.routeStartTime ||
      (driver.postcodeAreas.length === 0 &&
        !manualAssignmentCountByDriver[driver.id]),
  );

  return (
    <>
      <div className={styles.bar}>
        {canLock && (
          <Button
            variant="secondary"
            leftIcon={<Lock size={16} />}
            onClick={() => openConfirm("lock")}
            disabled={!!actionLoading}
          >
            Lock Run
          </Button>
        )}

        {canUnlock && (
          <Button
            variant="ghost"
            leftIcon={<Unlock size={16} />}
            onClick={() => openConfirm("unlock")}
            disabled={!!actionLoading}
          >
            Unlock
          </Button>
        )}

        {canOptimize && (
          <>
            {run.status === "draft" && (
              <div className={styles.warning}>
                <AlertTriangle size={16} />
                Run is not locked
              </div>
            )}
            <Button
              variant="primary"
              leftIcon={
                actionLoading === "optimize" ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : (
                  <Route size={16} />
                )
              }
              onClick={() => openConfirm("optimize")}
              disabled={!!actionLoading}
              isLoading={actionLoading === "optimize"}
            >
              {actionLoading === "optimize"
                ? "Optimizing..."
                : "Optimize Routes"}
            </Button>
          </>
        )}

        {canReoptimize && (
          <Button
            variant="secondary"
            leftIcon={<RefreshCw size={16} />}
            onClick={() => openConfirm("reoptimize")}
            disabled={!!actionLoading}
            isLoading={actionLoading === "optimize"}
          >
            {actionLoading === "optimize" ? "Optimizing..." : "Re-optimize"}
          </Button>
        )}

        <div className={styles.spacer} />

        {canDispatch && (
          <Button
            variant="primary"
            leftIcon={<Truck size={16} />}
            onClick={() => openConfirm("dispatch")}
            disabled={!!actionLoading}
          >
            Dispatch
          </Button>
        )}
      </div>

      <Modal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={getConfirmTitle()}
        size="xl"
      >
        <p className={styles.modalMessage}>{getConfirmMessage()}</p>

        {(confirmAction === "optimize" || confirmAction === "reoptimize") && (
          <div className={styles.optimizeModal}>
            <div className={styles.modalIntroCard}>
              <div>
                <div className={styles.modalEyebrow}>Driver routing setup</div>
                <div className={styles.modalHeadline}>
                  Assign postcode areas from this run to each selected driver.
                </div>
              </div>
              <div className={styles.modalStats}>
                <div className={styles.modalStat}>
                  <strong>{availableRoutingAreas.length}</strong>
                  <span>postcode areas</span>
                </div>
                <div className={styles.modalStat}>
                  <strong>{selectedDrivers.length}</strong>
                  <span>drivers selected</span>
                </div>
                <div className={styles.modalStat}>
                  <strong>{Object.keys(manualAssignments).length}</strong>
                  <span>manual stop assignments</span>
                </div>
              </div>
            </div>

            <div className={styles.availableAreasPanel}>
              <div className={styles.panelHeader}>
                <div>
                  <div className={styles.panelTitle}>
                    Areas found on this run
                  </div>
                  <div className={styles.panelHint}>
                    These options are calculated from the current orders in the
                    batch.
                  </div>
                </div>
              </div>

              {availableRoutingAreas.length > 0 ? (
                <div className={styles.areaCatalog}>
                  {availableRoutingAreas.map((entry) => (
                    <div key={entry.area} className={styles.catalogChip}>
                      <span>{entry.area}</span>
                      <small>{entry.orderCount} orders</small>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  No postcode areas could be calculated from the current run.
                </div>
              )}
            </div>

            {driversLoading ? (
              <div className={styles.emptyState}>Loading drivers...</div>
            ) : drivers.length === 0 ? (
              <div className={styles.emptyState}>No drivers available.</div>
            ) : (
              <>
                <div className={styles.driverGrid}>
                  {drivers.map((d) => {
                    const checked = d.selected;
                    const hasPostcodeAreas = d.postcodeAreas.length > 0;
                    const hasStartTime = Boolean(d.routeStartTime);
                    const manualStopCount =
                      manualAssignmentCountByDriver[d.id] || 0;
                    const extraSelectedAreas = d.postcodeAreas.filter(
                      (area) => !availableAreaSet.has(area),
                    );

                    return (
                      <div
                        key={d.id}
                        className={`${styles.driverCard} ${checked ? styles.driverCardActive : ""}`}
                      >
                        <label className={styles.driverToggle}>
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(val) => {
                              const isChecked = val === true;
                              setDrivers((prev) =>
                                prev.map((driver) =>
                                  driver.id === d.id
                                    ? { ...driver, selected: isChecked }
                                    : driver,
                                ),
                              );
                              if (!isChecked) {
                                setManualAssignments((prev) =>
                                  Object.fromEntries(
                                    Object.entries(prev).filter(
                                      ([, driverId]) => driverId !== d.id,
                                    ),
                                  ),
                                );
                              }
                            }}
                          />
                          <span className={styles.driverIdentity}>
                            <strong>{d.name}</strong>
                            <small>{d.email}</small>
                          </span>
                          {manualStopCount > 0 && (
                            <span className={styles.assignmentCountBadge}>
                              {manualStopCount} manual
                            </span>
                          )}
                        </label>

                        <div className={styles.driverBody}>
                          <Input
                            type="time"
                            label="Route start time"
                            value={d.routeStartTime}
                            onChange={(e) => {
                              const value = e.target.value;
                              setDrivers((prev) =>
                                prev.map((driver) =>
                                  driver.id === d.id
                                    ? { ...driver, routeStartTime: value }
                                    : driver,
                                ),
                              );
                            }}
                            fullWidth
                            disabled={!checked}
                          />

                          <div className={styles.selectorBlock}>
                            <div className={styles.selectorHeader}>
                              <div>
                                <div className={styles.selectorTitle}>
                                  Postcode areas
                                </div>
                                <div className={styles.selectorHint}>
                                  Select one or more areas from the orders in
                                  this run.
                                </div>
                              </div>
                              <div className={styles.selectorActions}>
                                <button
                                  type="button"
                                  className={styles.selectorAction}
                                  disabled={
                                    !checked ||
                                    availableRoutingAreas.length === 0
                                  }
                                  onClick={() => {
                                    setDrivers((prev) =>
                                      prev.map((driver) =>
                                        driver.id === d.id
                                          ? {
                                              ...driver,
                                              postcodeAreas: uniqueSortedAreas([
                                                ...availableRoutingAreas.map(
                                                  (entry) => entry.area,
                                                ),
                                                ...driver.postcodeAreas,
                                              ]),
                                            }
                                          : driver,
                                      ),
                                    );
                                  }}
                                >
                                  Select all
                                </button>
                                <button
                                  type="button"
                                  className={styles.selectorAction}
                                  disabled={
                                    !checked || d.postcodeAreas.length === 0
                                  }
                                  onClick={() => {
                                    setDrivers((prev) =>
                                      prev.map((driver) =>
                                        driver.id === d.id
                                          ? { ...driver, postcodeAreas: [] }
                                          : driver,
                                      ),
                                    );
                                  }}
                                >
                                  Clear
                                </button>
                              </div>
                            </div>

                            {availableRoutingAreas.length > 0 ? (
                              <div className={styles.areaSelectionGrid}>
                                {availableRoutingAreas.map((entry) => {
                                  const selected = d.postcodeAreas.includes(
                                    entry.area,
                                  );
                                  return (
                                    <button
                                      key={entry.area}
                                      type="button"
                                      className={`${styles.areaOption} ${selected ? styles.areaOptionSelected : ""}`}
                                      disabled={!checked}
                                      onClick={() =>
                                        toggleDriverArea(d.id, entry.area)
                                      }
                                    >
                                      <span>{entry.area}</span>
                                      <small>{entry.orderCount} orders</small>
                                    </button>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className={styles.emptyState}>
                                There are no order postcode areas available to
                                select.
                              </div>
                            )}

                            {extraSelectedAreas.length > 0 && (
                              <div className={styles.extraAreasBlock}>
                                <div className={styles.selectorHint}>
                                  Saved areas not present on this run
                                </div>
                                <div className={styles.areaSelectionGrid}>
                                  {extraSelectedAreas.map((area) => (
                                    <button
                                      key={area}
                                      type="button"
                                      className={`${styles.areaOption} ${styles.areaOptionSelected}`}
                                      disabled={!checked}
                                      onClick={() =>
                                        toggleDriverArea(d.id, area)
                                      }
                                    >
                                      <span>{area}</span>
                                      <small>Saved</small>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {checked && (!hasPostcodeAreas || !hasStartTime) ? (
                            <div className={styles.validationHint}>
                              {!hasPostcodeAreas && manualStopCount === 0
                                ? "Select one or more postcode areas for this driver."
                                : "Set a start time for this driver."}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className={styles.ordersPanel}>
                  <div className={styles.panelHeader}>
                    <div>
                      <div className={styles.panelTitle}>
                        All orders in this run
                      </div>
                      <div className={styles.panelHint}>
                        Review every order and optionally pre-assign a stop to a
                        driver before optimization.
                      </div>
                    </div>
                  </div>

                  {allOrders.length > 0 ? (
                    <div className={styles.ordersTableWrap}>
                      <table className={styles.ordersTable}>
                        <thead>
                          <tr>
                            <th>Order</th>
                            <th>Customer</th>
                            <th>Postcode</th>
                            <th>Area</th>
                            <th>Items</th>
                            <th>Driver</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allOrders.map((order) => {
                            const selectedDriverId =
                              manualAssignments[order.orderDbId] || "";
                            return (
                              <tr key={order.orderDbId}>
                                <td>
                                  <div className={styles.orderPrimary}>
                                    {order.orderId}
                                  </div>
                                </td>
                                <td>{order.customerName || "-"}</td>
                                <td>
                                  <div className={styles.orderPrimary}>
                                    {order.postcode || "-"}
                                  </div>
                                  {order.addressLine1 && (
                                    <div className={styles.orderSecondary}>
                                      {order.addressLine1}
                                    </div>
                                  )}
                                </td>
                                <td>{order.routingArea || "-"}</td>
                                <td>{order.totalItems}</td>
                                <td>
                                  <select
                                    className={styles.assignmentSelect}
                                    value={selectedDriverId}
                                    onChange={(event) => {
                                      const nextDriverId = String(
                                        event.target.value || "",
                                      );

                                      setManualAssignments((prev) => {
                                        if (!nextDriverId) {
                                          return Object.fromEntries(
                                            Object.entries(prev).filter(
                                              ([orderDbId]) =>
                                                orderDbId !== order.orderDbId,
                                            ),
                                          );
                                        }

                                        return {
                                          ...prev,
                                          [order.orderDbId]: nextDriverId,
                                        };
                                      });

                                      if (nextDriverId) {
                                        setDrivers((prev) =>
                                          prev.map((driver) =>
                                            driver.id === nextDriverId
                                              ? { ...driver, selected: true }
                                              : driver,
                                          ),
                                        );
                                      }
                                    }}
                                  >
                                    <option value="">Automatic</option>
                                    {drivers.map((driver) => (
                                      <option key={driver.id} value={driver.id}>
                                        {driver.name}
                                        {driver.selected
                                          ? ""
                                          : " (selects on assign)"}
                                      </option>
                                    ))}
                                  </select>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className={styles.emptyState}>
                      No orders found for this run.
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
        <ModalFooter>
          <Button variant="ghost" onClick={() => setConfirmAction(null)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={
              !!actionLoading ||
              ((confirmAction === "optimize" ||
                confirmAction === "reoptimize") &&
                (selectedDrivers.length === 0 ||
                  hasInvalidSelectedDriverConfig))
            }
          >
            {actionLoading ? "Processing..." : "Confirm"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
};

export default RunActionsBar;
