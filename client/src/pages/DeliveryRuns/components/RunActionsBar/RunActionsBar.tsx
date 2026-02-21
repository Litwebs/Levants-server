import React, { useState } from "react";
import {
  Lock,
  Unlock,
  Route,
  Truck,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import type { DeliveryRun } from "@/context/DeliveryRuns";
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
    driverIds: string[],
    window: { startTime: string },
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

export const RunActionsBar: React.FC<RunActionsBarProps> = ({
  run,
  actionLoading,
  onLock,
  onUnlock,
  onOptimize,
  onDispatch,
}) => {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [drivers, setDrivers] = useState<
    Array<{ id: string; name: string; email: string }>
  >([]);
  const [driversLoading, setDriversLoading] = useState(false);
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);
  const [startTime, setStartTime] = useState<string>(
    run.deliveryWindowStart || "",
  );

  const openConfirm = async (action: ConfirmAction) => {
    setConfirmAction(action);

    if (action === "optimize" || action === "reoptimize") {
      setStartTime(run.deliveryWindowStart || "");
      setDriversLoading(true);
      try {
        const list = await listDrivers();
        setDrivers(list);
        setSelectedDriverIds(list.map((d) => d.id));
      } catch {
        setDrivers([]);
        setSelectedDriverIds([]);
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
        success = await onOptimize(selectedDriverIds, {
          startTime,
        });
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
        size="sm"
      >
        <p
          style={{
            marginBottom: "var(--space-4)",
            color: "var(--color-gray-600)",
          }}
        >
          {getConfirmMessage()}
        </p>

        {(confirmAction === "optimize" || confirmAction === "reoptimize") && (
          <div style={{ marginBottom: "var(--space-4)" }}>
            <div
              style={{
                fontSize: "var(--text-sm)",
                fontWeight: "var(--font-medium)",
                color: "var(--color-gray-700)",
                marginBottom: "var(--space-2)",
              }}
            >
              Drivers
            </div>

            {driversLoading ? (
              <div
                style={{
                  color: "var(--color-gray-600)",
                  fontSize: "var(--text-sm)",
                }}
              >
                Loading drivers...
              </div>
            ) : drivers.length === 0 ? (
              <div
                style={{
                  color: "var(--color-gray-600)",
                  fontSize: "var(--text-sm)",
                }}
              >
                No drivers available.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-2)",
                  maxHeight: 220,
                  overflow: "auto",
                }}
              >
                {drivers.map((d) => {
                  const checked = selectedDriverIds.includes(d.id);
                  return (
                    <label
                      key={d.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "var(--space-2)",
                        color: "var(--color-gray-700)",
                      }}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(val) => {
                          const isChecked = val === true;
                          setSelectedDriverIds((prev) => {
                            if (isChecked)
                              return prev.includes(d.id)
                                ? prev
                                : [...prev, d.id];
                            return prev.filter((x) => x !== d.id);
                          });
                        }}
                      />
                      <span style={{ fontSize: "var(--text-sm)" }}>
                        {d.name} ({d.email})
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: "var(--space-4)" }}>
              <div
                style={{
                  fontSize: "var(--text-sm)",
                  fontWeight: "var(--font-medium)",
                  color: "var(--color-gray-700)",
                  marginBottom: "var(--space-2)",
                }}
              >
                Delivery Window
              </div>

              <div style={{ display: "flex", gap: "var(--space-3)" }}>
                <Input
                  type="time"
                  label="Start time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  fullWidth
                />
              </div>

              <p
                style={{
                  marginTop: "var(--space-2)",
                  color: "var(--color-gray-500)",
                  fontSize: "var(--text-xs)",
                }}
              >
                ETA will be scheduled from this start time.
              </p>
            </div>
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
                (selectedDriverIds.length === 0 || !startTime))
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
