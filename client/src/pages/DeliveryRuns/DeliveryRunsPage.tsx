import React, { useState, useMemo } from "react";
import { Loader2, Plus, Calendar } from "lucide-react";
import { useDeliveryRuns } from "./useDeliveryRuns";
import { DeliveryRunsTable } from "./components";
import { Button, Modal, ModalFooter, Select } from "@/components/common";
import { useToast } from "@/components/common/Toast";
import { Checkbox } from "@/components/ui/checkbox";
import { listEligibleOrders } from "@/context/DeliveryRuns";
import styles from "./DeliveryRunsPage.module.css";

type QuickFilter = "next" | "week" | "all";

export const DeliveryRunsPage: React.FC = () => {
  const { runs, loading, error, params, updateFilters, createRun, creating } =
    useDeliveryRuns();
  const { showToast } = useToast();

  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRunDate, setNewRunDate] = useState("");
  const [eligibleOrders, setEligibleOrders] = useState<Array<any>>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  // Calculate quick filter dates
  const filterDates = useMemo(() => {
    const today = new Date();
    const nextDeliveryDays: Date[] = [];

    // Find next 2 delivery days (assuming Tue/Fri for example)
    for (let i = 1; i <= 14 && nextDeliveryDays.length < 2; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const day = d.getDay();
      // Assume delivery days are Tuesday (2) and Friday (5)
      if (day === 2 || day === 5) {
        nextDeliveryDays.push(d);
      }
    }

    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    return {
      next: nextDeliveryDays[0]?.toISOString().split("T")[0],
      weekEnd: weekEnd.toISOString().split("T")[0],
      today: today.toISOString().split("T")[0],
    };
  }, []);

  const handleQuickFilter = (filter: QuickFilter) => {
    setQuickFilter(filter);

    switch (filter) {
      case "next":
        updateFilters({
          fromDate: filterDates.next,
          toDate: filterDates.next,
          status: "all",
        });
        break;
      case "week":
        updateFilters({
          fromDate: filterDates.today,
          toDate: filterDates.weekEnd,
          status: "all",
        });
        break;
      case "all":
      default:
        updateFilters({
          fromDate: undefined,
          toDate: undefined,
          status: "all",
        });
    }
  };

  const handleStatusFilter = (status: string) => {
    updateFilters({ status: status as any });
  };

  const handleCreateRun = async () => {
    if (!newRunDate) return;
    if (selectedOrderIds.length === 0) {
      showToast({ type: "error", title: "Select at least one order" });
      return;
    }

    const result = await createRun(newRunDate, selectedOrderIds);
    if (result.success) {
      showToast({ type: "success", title: "Delivery run created" });
      setShowCreateModal(false);
      setNewRunDate("");
      setEligibleOrders([]);
      setSelectedOrderIds([]);
    } else {
      showToast({
        type: "error",
        title: result.message || "Failed to create run",
      });
    }
  };

  const loadOrdersForDate = async (date: string) => {
    if (!date) return;
    setOrdersLoading(true);
    try {
      const orders = await listEligibleOrders(date);
      setEligibleOrders(orders);
      setSelectedOrderIds(orders.map((o: any) => o.id));
    } catch {
      setEligibleOrders([]);
      setSelectedOrderIds([]);
    } finally {
      setOrdersLoading(false);
    }
  };

  // Default to next Tuesday or Friday for new run
  const getDefaultDate = () => {
    return filterDates.next || new Date().toISOString().split("T")[0];
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Delivery Runs</h1>
        <Button
          variant="primary"
          onClick={() => {
            setNewRunDate(getDefaultDate());
            setShowCreateModal(true);
            // Load eligible orders for default date.
            loadOrdersForDate(getDefaultDate());
          }}
        >
          <Plus size={18} />
          Create Delivery Run
        </Button>
      </div>

      <div className={styles.filters}>
        <div className={styles.quickFilters}>
          <button
            className={`${styles.quickFilter} ${quickFilter === "next" ? styles.active : ""}`}
            onClick={() => handleQuickFilter("next")}
          >
            Next Delivery
          </button>
          <button
            className={`${styles.quickFilter} ${quickFilter === "week" ? styles.active : ""}`}
            onClick={() => handleQuickFilter("week")}
          >
            This Week
          </button>
          <button
            className={`${styles.quickFilter} ${quickFilter === "all" ? styles.active : ""}`}
            onClick={() => handleQuickFilter("all")}
          >
            All
          </button>
        </div>

        <div className={styles.filterGroup}>
          <span className={styles.filterLabel}>Status:</span>
          <Select
            value={params.status || "all"}
            onChange={(value) => handleStatusFilter(value)}
            options={[
              { value: "all", label: "All Statuses" },
              { value: "draft", label: "Draft" },
              { value: "locked", label: "Locked" },
              { value: "routed", label: "Routed" },
              { value: "dispatched", label: "Dispatched" },
              { value: "completed", label: "Completed" },
            ]}
          />
        </div>
      </div>

      <div className={styles.tableCard}>
        {loading ? (
          <div className={styles.loading}>
            <Loader2 size={24} className={styles.spinner} />
            Loading delivery runs...
          </div>
        ) : error ? (
          <div className={styles.error}>{error}</div>
        ) : (
          <DeliveryRunsTable runs={runs} />
        )}
      </div>

      {/* Create Run Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Create Delivery Run"
        size="sm"
      >
        <div className={styles.formField}>
          <label className={styles.formLabel}>
            <Calendar
              size={16}
              style={{
                display: "inline",
                marginRight: "8px",
                verticalAlign: "middle",
              }}
            />
            Delivery Date
          </label>
          <input
            type="date"
            className={styles.formInput}
            value={newRunDate}
            onChange={(e) => {
              const v = e.target.value;
              setNewRunDate(v);
              loadOrdersForDate(v);
            }}
            min={new Date().toISOString().split("T")[0]}
          />
          <p className={styles.formHelp}>
            Select the date for this delivery run. Orders for this date will be
            included.
          </p>
        </div>

        <div className={styles.formField}>
          <label className={styles.formLabel}>Orders</label>
          {ordersLoading ? (
            <div className={styles.formHelp}>Loading orders...</div>
          ) : eligibleOrders.length === 0 ? (
            <div className={styles.formHelp}>
              No eligible paid orders found for this date.
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-2)",
                maxHeight: 260,
                overflow: "auto",
                border: "1px solid var(--color-gray-200)",
                borderRadius: "var(--radius-md)",
                padding: "var(--space-3)",
              }}
            >
              {eligibleOrders.map((o: any) => {
                const checked = selectedOrderIds.includes(o.id);
                return (
                  <label
                    key={o.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "var(--space-2)",
                    }}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(val) => {
                        const isChecked = val === true;
                        setSelectedOrderIds((prev) => {
                          if (isChecked)
                            return prev.includes(o.id) ? prev : [...prev, o.id];
                          return prev.filter((x) => x !== o.id);
                        });
                      }}
                    />
                    <span
                      style={{
                        fontSize: "var(--text-sm)",
                        color: "var(--color-gray-700)",
                      }}
                    >
                      {o.orderId} • {o.customerName || "Customer"} •{" "}
                      {o.postcode}
                    </span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={() => setShowCreateModal(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleCreateRun}
            disabled={!newRunDate || creating || selectedOrderIds.length === 0}
          >
            {creating ? "Creating..." : "Create Run"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default DeliveryRunsPage;
