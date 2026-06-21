import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  DataTableCard,
  Input,
  Modal,
  ModalFooter,
  Select,
  Table,
} from "../../components/common";
import sharedTableStyles from "../../components/common/DataTableCard/DataTableCard.module.css";
import sharedFilterStyles from "../../components/common/FiltersCardLayout/SharedFilters.module.css";
import {
  useSubscriptions,
  type Subscription,
  type SubscriptionDelivery,
  type SubscriptionOrder,
  type SubscriptionPayment,
} from "../../context/Subscriptions";
import { useToast } from "../../components/common/Toast";
import { useVariantSearch } from "../Discounts/useVariantSearch";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Search,
  X as XIcon,
  Plus,
} from "lucide-react";
import styles from "./SubscriptionDetails.module.css";

const DAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const FREQUENCY_OPTIONS = [
  { value: "weekly", label: "Weekly" },
  { value: "every_two_weeks", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
];

const STATUS_LABELS: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  cancelled: "Cancelled",
};

type TabId = "overview" | "deliveries" | "orders" | "payments";

type ListMeta = {
  page: number;
  pageSize: number;
  total: number;
};

type VariantSearchItem = {
  _id: string;
  name: string;
  sku?: string;
  product?: { name?: string } | null;
};

type StagedAddItem = {
  variantId: string;
  name: string;
  sku?: string;
  quantity: number;
};

const DEFAULT_META = (page = 1, pageSize = 10): ListMeta => ({
  page,
  pageSize,
  total: 0,
});

const PAGE_SIZE_OPTIONS = [
  { value: "10", label: "10 - page" },
  { value: "20", label: "20 - page" },
  { value: "50", label: "50 - page" },
];

const ITEMS_WIZARD_STEPS = [
  { id: 1 as const, label: "Select Products" },
  { id: 2 as const, label: "Summary" },
  { id: 3 as const, label: "Confirm" },
];

const toneFromStatus = (status: string) => {
  const normalized = String(status || "").toLowerCase();
  if (
    ["active", "paid", "delivered", "generated", "succeeded"].includes(
      normalized,
    )
  ) {
    return "success";
  }
  if (
    [
      "paused",
      "scheduled",
      "pending",
      "partially_paid",
      "partially_refunded",
      "refund_pending",
    ].includes(normalized)
  ) {
    return "warning";
  }
  if (
    ["cancelled", "failed", "refunded", "refund_failed"].includes(normalized)
  ) {
    return "danger";
  }
  return "neutral";
};

const getCustomerName = (customer: Subscription["customer"]) => {
  if (typeof customer === "string") return customer;
  return `${customer.firstName} ${customer.lastName}`.trim();
};

const getCustomerEmail = (customer: Subscription["customer"]) => {
  if (typeof customer === "string") return "";
  return customer.email;
};

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

export default function SubscriptionDetailsPage() {
  const { subscriptionId = "" } = useParams<{ subscriptionId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const {
    getSubscription,
    getSubscriptionDeliveries,
    getSubscriptionOrders,
    getSubscriptionPayments,
    updateSubscription,
    pauseSubscription,
    resumeSubscription,
    cancelSubscription,
    addSubscriptionItem,
    updateSubscriptionItem,
    removeSubscriptionItem,
  } = useSubscriptions();
  const variantSearch = useVariantSearch();

  const [tab, setTab] = useState<TabId>("overview");
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [deliveries, setDeliveries] = useState<SubscriptionDelivery[]>([]);
  const [orders, setOrders] = useState<SubscriptionOrder[]>([]);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);

  const [itemsPage, setItemsPage] = useState(1);
  const [itemsPageSize, setItemsPageSize] = useState(10);
  const [deliveriesPage, setDeliveriesPage] = useState(1);
  const [deliveriesPageSize, setDeliveriesPageSize] = useState(10);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize, setOrdersPageSize] = useState(10);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsPageSize, setPaymentsPageSize] = useState(10);

  const [deliveriesMeta, setDeliveriesMeta] = useState<ListMeta>(
    DEFAULT_META(1, 10),
  );
  const [ordersMeta, setOrdersMeta] = useState<ListMeta>(DEFAULT_META(1, 10));
  const [paymentsMeta, setPaymentsMeta] = useState<ListMeta>(
    DEFAULT_META(1, 10),
  );

  const [loading, setLoading] = useState(true);
  const [deliveriesLoading, setDeliveriesLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [frequency, setFrequency] = useState("weekly");
  const [statusDraft, setStatusDraft] = useState<
    "active" | "paused" | "cancelled"
  >("active");
  const [preferredDeliveryDay, setPreferredDeliveryDay] = useState("1");
  const [notes, setNotes] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [itemsBulkLoading, setItemsBulkLoading] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelModalReason, setCancelModalReason] = useState("");
  const [isItemsModalOpen, setIsItemsModalOpen] = useState(false);
  const [itemsWizardStep, setItemsWizardStep] = useState<1 | 2 | 3>(1);
  const [stagedAdds, setStagedAdds] = useState<StagedAddItem[]>([]);
  const [stagedRemoveIds, setStagedRemoveIds] = useState<string[]>([]);
  const [searchQuantities, setSearchQuantities] = useState<
    Record<string, string>
  >({});
  const [applyChangesLoading, setApplyChangesLoading] = useState(false);

  const hydrateEditor = (value: Subscription) => {
    setStatusDraft(value.status);
    setFrequency(value.frequency);
    setPreferredDeliveryDay(String(value.preferredDeliveryDay));
    setNotes(value.notes || "");
  };

  const normalizeSubscriptionForView = (
    next: Subscription,
    prev: Subscription | null,
  ): Subscription => {
    if (!prev) return next;
    if (typeof next.customer !== "string") return next;
    if (typeof prev.customer === "string") return next;
    return {
      ...next,
      customer: prev.customer,
    };
  };

  const hasFormChanges = useMemo(() => {
    if (!subscription) return false;
    return (
      frequency !== subscription.frequency ||
      Number(preferredDeliveryDay) !==
        Number(subscription.preferredDeliveryDay) ||
      notes.trim() !== String(subscription.notes || "").trim() ||
      statusDraft !== subscription.status
    );
  }, [frequency, preferredDeliveryDay, notes, statusDraft, subscription]);

  const statusOptions = useMemo(() => {
    if (subscription?.status === "cancelled") {
      return [{ value: "cancelled", label: "Cancelled" }];
    }
    return [
      { value: "active", label: "Active" },
      { value: "paused", label: "Paused" },
    ];
  }, [subscription?.status]);

  const loadSubscription = async (isRefresh = false) => {
    if (!subscriptionId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const detail = await getSubscription(subscriptionId);
      setSubscription(detail);
      hydrateEditor(detail);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to load subscription");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const loadDeliveries = async () => {
    if (!subscriptionId) return;
    setDeliveriesLoading(true);
    try {
      const data = await getSubscriptionDeliveries(subscriptionId, {
        page: deliveriesPage,
        pageSize: deliveriesPageSize,
      });
      setDeliveries(data.deliveries || []);
      setDeliveriesMeta(
        data.meta || {
          page: deliveriesPage,
          pageSize: deliveriesPageSize,
          total: data.deliveries.length,
        },
      );
    } finally {
      setDeliveriesLoading(false);
    }
  };

  const loadOrders = async () => {
    if (!subscriptionId) return;
    setOrdersLoading(true);
    try {
      const data = await getSubscriptionOrders(subscriptionId, {
        page: ordersPage,
        pageSize: ordersPageSize,
      });
      setOrders(data.orders || []);
      setOrdersMeta(
        data.meta || {
          page: ordersPage,
          pageSize: ordersPageSize,
          total: data.orders.length,
        },
      );
    } finally {
      setOrdersLoading(false);
    }
  };

  const loadPayments = async () => {
    if (!subscriptionId) return;
    setPaymentsLoading(true);
    try {
      const data = await getSubscriptionPayments(subscriptionId, {
        page: paymentsPage,
        pageSize: paymentsPageSize,
      });
      setPayments(data.payments || []);
      setPaymentsMeta(
        data.meta || {
          page: paymentsPage,
          pageSize: paymentsPageSize,
          total: (data.payments || []).length,
        },
      );
    } finally {
      setPaymentsLoading(false);
    }
  };

  useEffect(() => {
    loadSubscription(false);
  }, [subscriptionId]);

  useEffect(() => {
    if (tab !== "deliveries") return;
    loadDeliveries();
  }, [tab, subscriptionId, deliveriesPage, deliveriesPageSize]);

  useEffect(() => {
    if (tab !== "orders") return;
    loadOrders();
  }, [tab, subscriptionId, ordersPage, ordersPageSize]);

  useEffect(() => {
    if (tab !== "payments") return;
    loadPayments();
  }, [tab, subscriptionId, paymentsPage, paymentsPageSize]);

  const totalItems = useMemo(() => {
    if (!subscription) return 0;
    return subscription.items.reduce(
      (sum, item) => sum + (item.quantity || 0),
      0,
    );
  }, [subscription]);

  const canManageItems = !!subscription && subscription.status !== "cancelled";

  const pagedItems = useMemo(() => {
    if (!subscription) return [];
    const start = (itemsPage - 1) * itemsPageSize;
    return subscription.items.slice(start, start + itemsPageSize);
  }, [subscription, itemsPage, itemsPageSize]);

  const itemsTotalPages = Math.max(
    1,
    Math.ceil((subscription?.items.length ?? 0) / itemsPageSize),
  );

  useEffect(() => {
    if (itemsPage > itemsTotalPages) {
      setItemsPage(itemsTotalPages);
    }
  }, [itemsPage, itemsTotalPages]);

  useEffect(() => {
    setSelectedItemIds((prev) => {
      const validIds = new Set(
        (subscription?.items || []).map((item) => item._id),
      );
      return prev.filter((id) => validIds.has(id));
    });
  }, [subscription]);

  const renderSoftTag = (value?: string | null) => {
    const normalized = String(value || "").toLowerCase();
    const tone = toneFromStatus(normalized);
    return (
      <span className={`${styles.softTag} ${styles[`soft-${tone}`]}`}>
        {normalized ? normalized.replace(/_/g, " ") : "-"}
      </span>
    );
  };

  const handleRefresh = async () => {
    await loadSubscription(true);
    if (tab === "deliveries") await loadDeliveries();
    if (tab === "orders") await loadOrders();
    if (tab === "payments") await loadPayments();
  };

  const saveChanges = async () => {
    if (!subscription) return;
    if (!hasFormChanges) return;
    setSaving(true);
    try {
      let next = subscription;

      const hasSettingsChanges =
        frequency !== subscription.frequency ||
        Number(preferredDeliveryDay) !==
          Number(subscription.preferredDeliveryDay) ||
        notes.trim() !== String(subscription.notes || "").trim();

      if (hasSettingsChanges) {
        next = await updateSubscription(subscription._id, {
          frequency,
          preferredDeliveryDay: Number(preferredDeliveryDay),
          notes: notes.trim() || null,
        });
      }

      if (statusDraft !== next.status) {
        if (statusDraft === "paused" && next.status === "active") {
          next = await pauseSubscription(next._id);
        } else if (statusDraft === "active" && next.status === "paused") {
          next = await resumeSubscription(next._id);
        }
      }

      const normalized = normalizeSubscriptionForView(next, subscription);
      setSubscription(normalized);
      hydrateEditor(normalized);
      showToast({ type: "success", title: "Subscription updated" });
    } catch (e: any) {
      showToast({
        type: "error",
        title: e?.response?.data?.message || "Failed to update subscription",
      });
    } finally {
      setSaving(false);
    }
  };

  const applySubscriptionPatch = (next: Subscription) => {
    const normalized = normalizeSubscriptionForView(next, subscription);
    setSubscription(normalized);
    hydrateEditor(normalized);
  };

  const handleCancel = async () => {
    if (!subscription || subscription.status === "cancelled") return;
    setActionBusy(true);
    try {
      const next = await cancelSubscription(
        subscription._id,
        cancelModalReason.trim() || undefined,
      );
      applySubscriptionPatch(next);
      setCancelModalReason("");
      setIsCancelModalOpen(false);
      showToast({ type: "success", title: "Subscription cancelled" });
      await loadSubscription(true);
    } catch (e: any) {
      showToast({
        type: "error",
        title: e?.response?.data?.message || "Failed to cancel subscription",
      });
    } finally {
      setActionBusy(false);
    }
  };

  const toggleItemSelection = (itemId: string) => {
    setSelectedItemIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId],
    );
  };

  const toggleSelectAllItemsOnPage = () => {
    const pageIds = pagedItems.map((item) => item._id);
    if (!pageIds.length) return;
    const allSelected = pageIds.every((id) => selectedItemIds.includes(id));
    if (allSelected) {
      setSelectedItemIds((prev) => prev.filter((id) => !pageIds.includes(id)));
      return;
    }
    setSelectedItemIds((prev) => Array.from(new Set([...prev, ...pageIds])));
  };

  const applyBulkQuantityDelta = async (delta: number) => {
    if (!subscription || !canManageItems || selectedItemIds.length === 0)
      return;
    setItemsBulkLoading(true);
    try {
      let nextSubscription = subscription;
      for (const itemId of selectedItemIds) {
        const current = nextSubscription.items.find(
          (item) => item._id === itemId,
        );
        if (!current) continue;
        const nextQty = Math.max(1, Number(current.quantity || 1) + delta);
        nextSubscription = await updateSubscriptionItem(
          nextSubscription._id,
          itemId,
          {
            quantity: nextQty,
          },
        );
      }
      applySubscriptionPatch(nextSubscription);
      showToast({ type: "success", title: "Selected items updated" });
    } catch (e: any) {
      showToast({
        type: "error",
        title: e?.response?.data?.message || "Failed to update selected items",
      });
    } finally {
      setItemsBulkLoading(false);
    }
  };

  const removeSelectedItems = async () => {
    if (!subscription || !canManageItems || selectedItemIds.length === 0)
      return;
    setItemsBulkLoading(true);
    try {
      let nextSubscription = subscription;
      for (const itemId of selectedItemIds) {
        if (nextSubscription.items.length <= 1) break;
        nextSubscription = await removeSubscriptionItem(
          nextSubscription._id,
          itemId,
        );
      }
      applySubscriptionPatch(nextSubscription);
      setSelectedItemIds([]);
      showToast({ type: "success", title: "Selected items removed" });
    } catch (e: any) {
      showToast({
        type: "error",
        title: e?.response?.data?.message || "Failed to remove selected items",
      });
    } finally {
      setItemsBulkLoading(false);
    }
  };

  const openItemsWizard = () => {
    if (!canManageItems) return;
    setItemsWizardStep(1);
    setStagedAdds([]);
    setStagedRemoveIds([]);
    setSearchQuantities({});
    variantSearch.setQuery("");
    setIsItemsModalOpen(true);
  };

  const closeItemsWizard = () => {
    setIsItemsModalOpen(false);
    setItemsWizardStep(1);
    setStagedAdds([]);
    setStagedRemoveIds([]);
    setSearchQuantities({});
    variantSearch.setQuery("");
  };

  const setResultQuantity = (variantId: string, value: string) => {
    setSearchQuantities((prev) => ({ ...prev, [variantId]: value }));
  };

  const getResultQuantity = (variantId: string) => {
    const raw = searchQuantities[variantId];
    const parsed = Math.floor(Number(raw || 1));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  };

  const stageAddVariant = (variant: VariantSearchItem) => {
    const qty = getResultQuantity(variant._id);
    setStagedAdds((prev) => {
      const idx = prev.findIndex((item) => item.variantId === variant._id);
      if (idx === -1) {
        return [
          ...prev,
          {
            variantId: variant._id,
            name: variant.name,
            sku: variant.sku,
            quantity: qty,
          },
        ];
      }
      const next = [...prev];
      next[idx] = {
        ...next[idx],
        quantity: next[idx].quantity + qty,
      };
      return next;
    });
  };

  const setStagedAddQuantity = (variantId: string, quantity: number) => {
    const nextQty = Math.max(1, Math.floor(quantity));
    setStagedAdds((prev) =>
      prev.map((item) =>
        item.variantId === variantId ? { ...item, quantity: nextQty } : item,
      ),
    );
  };

  const removeStagedAdd = (variantId: string) => {
    setStagedAdds((prev) =>
      prev.filter((item) => item.variantId !== variantId),
    );
  };

  const toggleStagedRemoval = (itemId: string) => {
    setStagedRemoveIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId],
    );
  };

  const hasPendingChanges = stagedAdds.length > 0 || stagedRemoveIds.length > 0;

  const itemsMarkedForRemoval = useMemo(() => {
    if (!subscription) return [];
    return subscription.items.filter((item) =>
      stagedRemoveIds.includes(item._id),
    );
  }, [subscription, stagedRemoveIds]);

  const applyItemChanges = async () => {
    if (!subscription || !canManageItems || !hasPendingChanges) return;
    setApplyChangesLoading(true);
    try {
      let nextSubscription = subscription;

      for (const itemId of stagedRemoveIds) {
        nextSubscription = await removeSubscriptionItem(
          nextSubscription._id,
          itemId,
        );
      }

      for (const item of stagedAdds) {
        nextSubscription = await addSubscriptionItem(nextSubscription._id, {
          variantId: item.variantId,
          quantity: item.quantity,
        });
      }

      applySubscriptionPatch(nextSubscription);
      showToast({ type: "success", title: "Subscription items updated" });
      closeItemsWizard();
    } catch (e: any) {
      showToast({
        type: "error",
        title: e?.response?.data?.message || "Failed to apply item changes",
      });
    } finally {
      setApplyChangesLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingState}>
        <Loader2 className={styles.spinner} size={24} />
        Loading subscription details...
      </div>
    );
  }

  if (error || !subscription) {
    return (
      <div className={styles.errorState}>
        <p>{error || "Subscription not found"}</p>
        <Button variant="outline" onClick={() => navigate("/subscriptions")}>
          Back to Subscriptions
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <Button
          variant="ghost"
          leftIcon={<ArrowLeft size={16} />}
          onClick={() => navigate("/subscriptions")}
        >
          Back
        </Button>

        <div className={styles.headerMain}>
          <h1 className={styles.title}>{subscription.subscriptionNumber}</h1>
          <p className={styles.subtitle}>
            {getCustomerName(subscription.customer)}
          </p>
        </div>

        <Button
          variant="outline"
          leftIcon={<RefreshCw size={16} />}
          onClick={handleRefresh}
          isLoading={refreshing}
        >
          Refresh
        </Button>
      </div>

      <div className={styles.summaryGrid}>
        <Card className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Status</div>
          <div
            className={`${styles.heroStatusTag} ${styles[`status-${subscription.status}`]}`}
          >
            <span className={styles.heroStatusDot} />
            <span>
              {STATUS_LABELS[subscription.status] ?? subscription.status}
            </span>
          </div>
        </Card>

        <Card className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Frequency</div>
          <div className={styles.summaryValue}>
            {FREQUENCY_OPTIONS.find((f) => f.value === subscription.frequency)
              ?.label || subscription.frequency}
          </div>
        </Card>

        <Card className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Next Delivery</div>
          <div className={styles.summaryValue}>
            {formatDate(subscription.nextDeliveryDate)}
          </div>
        </Card>

        <Card className={styles.summaryCard}>
          <div className={styles.summaryLabel}>Items</div>
          <div className={styles.summaryValue}>{totalItems}</div>
        </Card>
      </div>

      <div className={styles.tabs}>
        <Button
          variant="ghost"
          size="sm"
          className={`${styles.tabBtn} ${tab === "overview" ? styles.activeTab : ""}`}
          onClick={() => setTab("overview")}
        >
          Overview & Manage
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`${styles.tabBtn} ${tab === "deliveries" ? styles.activeTab : ""}`}
          onClick={() => setTab("deliveries")}
        >
          Delivery History
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`${styles.tabBtn} ${tab === "orders" ? styles.activeTab : ""}`}
          onClick={() => setTab("orders")}
        >
          Orders History
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className={`${styles.tabBtn} ${tab === "payments" ? styles.activeTab : ""}`}
          onClick={() => setTab("payments")}
        >
          Payment History
        </Button>
      </div>

      {tab === "overview" ? (
        <div className={styles.overviewGrid}>
          <Card className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Manage Subscription</h3>
            <div className={styles.formGrid}>
              <Select
                label="Status"
                value={statusDraft}
                onChange={(value) =>
                  setStatusDraft(value as "active" | "paused" | "cancelled")
                }
                options={statusOptions}
                disabled={subscription.status === "cancelled"}
              />
              <Select
                label="Frequency"
                value={frequency}
                onChange={setFrequency}
                options={FREQUENCY_OPTIONS}
              />
              <Select
                label="Preferred Delivery Day"
                value={preferredDeliveryDay}
                onChange={setPreferredDeliveryDay}
                options={DAY_OPTIONS}
              />
              <div className={styles.fullWidth}>
                <label className={styles.fieldLabel}>Notes</label>
                <textarea
                  className={styles.notesInput}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Subscription notes"
                  rows={4}
                />
              </div>
            </div>

            <div className={styles.actionPanel}>
              <div className={styles.primaryActionsRow}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={saveChanges}
                  isLoading={saving}
                  disabled={!hasFormChanges || actionBusy}
                >
                  Save Changes
                </Button>
                {subscription.status !== "cancelled" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className={styles.dangerOutlineBtn}
                    onClick={() => setIsCancelModalOpen(true)}
                    disabled={actionBusy}
                  >
                    Cancel Subscription
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <Card className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Customer Details</h3>
            <div className={styles.infoGrid}>
              <div>
                <span className={styles.infoLabel}>Name</span>
                <span className={styles.infoValue}>
                  {getCustomerName(subscription.customer)}
                </span>
              </div>
              <div>
                <span className={styles.infoLabel}>Email</span>
                <span className={styles.infoValue}>
                  {getCustomerEmail(subscription.customer) || "-"}
                </span>
              </div>
              <div>
                <span className={styles.infoLabel}>Phone</span>
                <span className={styles.infoValue}>
                  {typeof subscription.customer === "string"
                    ? "-"
                    : subscription.customer.phone || "-"}
                </span>
              </div>
            </div>

            <h3 className={styles.sectionTitle}>Delivery Address</h3>
            <div className={styles.addressBlock}>
              <div>{subscription.deliveryAddress?.line1 || "-"}</div>
              {subscription.deliveryAddress?.line2 ? (
                <div>{subscription.deliveryAddress.line2}</div>
              ) : null}
              <div>
                {subscription.deliveryAddress?.city || "-"},{" "}
                {subscription.deliveryAddress?.postcode || "-"}
              </div>
              <div>{subscription.deliveryAddress?.country || "-"}</div>
              {subscription.deliveryAddress?.deliveryInstructions ? (
                <div className={styles.instructions}>
                  {subscription.deliveryAddress.deliveryInstructions}
                </div>
              ) : null}
            </div>
          </Card>

          <Card className={`${styles.sectionCard} ${styles.fullSpan}`}>
            <h3 className={styles.sectionTitle}>Subscription Items</h3>

            <div className={styles.itemsAdminPanel}>
              <div className={styles.itemsAdminPanelHeader}>
                <div className={styles.itemsAdminPanelTitle}>
                  Manage Products
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openItemsWizard}
                  disabled={!canManageItems}
                  leftIcon={<Plus size={14} />}
                >
                  Add / Remove Products
                </Button>
              </div>
              <p className={styles.wizardHint}>
                Launch the product manager to search variants, set quantities,
                review a summary, and confirm all changes in one flow.
              </p>
            </div>

            <DataTableCard
              className={styles.innerTableCard}
              pagination={{
                page: itemsPage,
                pageSize: itemsPageSize,
                total: subscription.items.length,
                totalPages: itemsTotalPages,
                setPage: setItemsPage,
                setPageSize: setItemsPageSize,
                pageSizeOptions: PAGE_SIZE_OPTIONS,
              }}
            >
              {selectedItemIds.length > 0 ? (
                <div className={styles.itemsBulkBar}>
                  <span className={styles.itemsBulkCount}>
                    {selectedItemIds.length} product(s) selected
                  </span>
                  <div className={styles.itemsBulkActions}>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => applyBulkQuantityDelta(1)}
                      isLoading={itemsBulkLoading}
                      disabled={!canManageItems}
                    >
                      Increase Qty
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => applyBulkQuantityDelta(-1)}
                      isLoading={itemsBulkLoading}
                      disabled={!canManageItems}
                    >
                      Decrease Qty
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={removeSelectedItems}
                      isLoading={itemsBulkLoading}
                      disabled={!canManageItems}
                    >
                      Remove Selected
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedItemIds([])}
                      disabled={itemsBulkLoading}
                    >
                      Clear Selection
                    </Button>
                  </div>
                </div>
              ) : null}

              <Table
                withWrapper={false}
                tableClassName={sharedTableStyles.table}
              >
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={
                          pagedItems.length > 0 &&
                          pagedItems.every((item) =>
                            selectedItemIds.includes(item._id),
                          )
                        }
                        onChange={toggleSelectAllItemsOnPage}
                      />
                    </th>
                    <th>Name</th>
                    <th>SKU</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedItems.length === 0 ? (
                    <tr className={sharedTableStyles.emptyStateRow}>
                      <td
                        className={sharedTableStyles.emptyTableCell}
                        colSpan={6}
                      >
                        No items
                      </td>
                    </tr>
                  ) : (
                    pagedItems.map((item) => {
                      const imageUrl = (
                        item as typeof item & {
                          imageUrl?: string | null;
                        }
                      ).imageUrl;

                      return (
                        <tr
                          key={item._id}
                          className={
                            selectedItemIds.includes(item._id)
                              ? styles.selectedItemRow
                              : undefined
                          }
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedItemIds.includes(item._id)}
                              onChange={() => toggleItemSelection(item._id)}
                            />
                          </td>
                          <td>
                            <div className={styles.itemCellWithImage}>
                              {imageUrl ? (
                                <img
                                  src={imageUrl}
                                  alt={item.name}
                                  className={styles.itemThumb}
                                />
                              ) : (
                                <div className={styles.itemThumbPlaceholder}>
                                  IMG
                                </div>
                              )}
                              <span>{item.name}</span>
                            </div>
                          </td>
                          <td>{item.sku}</td>
                          <td>{item.quantity}</td>
                          <td>GBP {Number(item.unitPrice || 0).toFixed(2)}</td>
                          <td>
                            GBP{" "}
                            {(
                              Number(item.unitPrice || 0) *
                              Number(item.quantity || 0)
                            ).toFixed(2)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </Table>
            </DataTableCard>
          </Card>
        </div>
      ) : null}

      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => {
          if (actionBusy) return;
          setIsCancelModalOpen(false);
        }}
        title="Cancel Subscription"
        size="md"
      >
        <div className={styles.cancelModalContent}>
          <p className={styles.cancelModalText}>
            You can provide an optional reason before confirming cancellation.
          </p>
          <label className={styles.fieldLabel}>Reason (optional)</label>
          <textarea
            className={styles.notesInput}
            rows={4}
            value={cancelModalReason}
            onChange={(e) => setCancelModalReason(e.target.value)}
            placeholder="Reason for cancellation"
            disabled={actionBusy}
          />
        </div>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setIsCancelModalOpen(false)}
            disabled={actionBusy}
          >
            Close
          </Button>
          <Button
            variant="danger"
            onClick={handleCancel}
            isLoading={actionBusy}
          >
            Confirm Cancellation
          </Button>
        </ModalFooter>
      </Modal>

      {tab === "deliveries" ? (
        <DataTableCard
          className={styles.historyTableCard}
          loading={deliveriesLoading}
          loadingText="Loading delivery history..."
          pagination={{
            page: deliveriesMeta.page,
            pageSize: deliveriesMeta.pageSize,
            total: deliveriesMeta.total,
            totalPages: Math.max(
              1,
              Math.ceil(deliveriesMeta.total / deliveriesMeta.pageSize),
            ),
            setPage: setDeliveriesPage,
            setPageSize: setDeliveriesPageSize,
            pageSizeOptions: PAGE_SIZE_OPTIONS,
            loading: deliveriesLoading,
          }}
        >
          <Table withWrapper={false} tableClassName={sharedTableStyles.table}>
            <thead>
              <tr>
                <th>Scheduled Date</th>
                <th>Status</th>
                <th>Generated At</th>
                <th>Order Ref</th>
                <th>Failure Reason</th>
              </tr>
            </thead>
            <tbody>
              {!deliveriesLoading && deliveries.length === 0 ? (
                <tr className={sharedTableStyles.emptyStateRow}>
                  <td className={sharedTableStyles.emptyTableCell} colSpan={5}>
                    No delivery history found
                  </td>
                </tr>
              ) : (
                deliveries.map((delivery) => (
                  <tr key={delivery._id}>
                    <td>{formatDate(delivery.scheduledDate)}</td>
                    <td>{renderSoftTag(delivery.status)}</td>
                    <td>{formatDate(delivery.generatedAt)}</td>
                    <td>{delivery.order?.orderId || "-"}</td>
                    <td>{delivery.failReason || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </DataTableCard>
      ) : null}

      {tab === "orders" ? (
        <DataTableCard
          className={styles.historyTableCard}
          loading={ordersLoading}
          loadingText="Loading order history..."
          pagination={{
            page: ordersMeta.page,
            pageSize: ordersMeta.pageSize,
            total: ordersMeta.total,
            totalPages: Math.max(
              1,
              Math.ceil(ordersMeta.total / ordersMeta.pageSize),
            ),
            setPage: setOrdersPage,
            setPageSize: setOrdersPageSize,
            pageSizeOptions: PAGE_SIZE_OPTIONS,
            loading: ordersLoading,
          }}
        >
          <Table withWrapper={false} tableClassName={sharedTableStyles.table}>
            <thead>
              <tr>
                <th>Order Ref</th>
                <th>Payment Status</th>
                <th>Delivery Status</th>
                <th>Total</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {!ordersLoading && orders.length === 0 ? (
                <tr className={sharedTableStyles.emptyStateRow}>
                  <td className={sharedTableStyles.emptyTableCell} colSpan={5}>
                    No orders found for this subscription
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order._id}>
                    <td>{order.orderId || "-"}</td>
                    <td>{renderSoftTag(order.status)}</td>
                    <td>{renderSoftTag(order.deliveryStatus)}</td>
                    <td>GBP {Number(order.total || 0).toFixed(2)}</td>
                    <td>{formatDate(order.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </DataTableCard>
      ) : null}

      {tab === "payments" ? (
        <DataTableCard
          className={styles.historyTableCard}
          loading={paymentsLoading}
          loadingText="Loading payment history..."
          pagination={{
            page: paymentsMeta.page,
            pageSize: paymentsMeta.pageSize,
            total: paymentsMeta.total,
            totalPages: Math.max(
              1,
              Math.ceil(paymentsMeta.total / paymentsMeta.pageSize),
            ),
            setPage: setPaymentsPage,
            setPageSize: setPaymentsPageSize,
            pageSizeOptions: PAGE_SIZE_OPTIONS,
            loading: paymentsLoading,
          }}
        >
          <Table withWrapper={false} tableClassName={sharedTableStyles.table}>
            <thead>
              <tr>
                <th>Order Ref</th>
                <th>Payment Status</th>
                <th>Amount</th>
                <th>Provider Ref</th>
                <th>Paid At</th>
              </tr>
            </thead>
            <tbody>
              {!paymentsLoading && payments.length === 0 ? (
                <tr className={sharedTableStyles.emptyStateRow}>
                  <td className={sharedTableStyles.emptyTableCell} colSpan={5}>
                    No payment history found for this subscription
                  </td>
                </tr>
              ) : (
                payments.map((row) => (
                  <tr key={row._id}>
                    <td>{row.order?.orderId || "-"}</td>
                    <td>{renderSoftTag(row.status)}</td>
                    <td>
                      {String(row.currency || "GBP").toUpperCase()}{" "}
                      {Number(row.amount || 0).toFixed(2)}
                    </td>
                    <td>{row.providerReference || "-"}</td>
                    <td>{formatDate(row.paidAt || row.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </DataTableCard>
      ) : null}

      <Modal
        isOpen={isItemsModalOpen}
        onClose={closeItemsWizard}
        title="Manage Subscription Products"
        size="xl"
      >
        <div className={styles.wizardHeaderTop}>
          <div className={styles.wizardHeaderSubtle}>
            Step {itemsWizardStep} of 3
          </div>
          <div className={styles.wizardStepper}>
            {ITEMS_WIZARD_STEPS.map((step, index) => {
              const isActive = itemsWizardStep === step.id;
              const isDone = itemsWizardStep > step.id;
              return (
                <div key={step.id} className={styles.wizardStepNode}>
                  <div
                    className={`${styles.wizardStepCircle} ${isActive ? styles.wizardStepCircleActive : ""} ${isDone ? styles.wizardStepCircleDone : ""}`}
                  >
                    {step.id}
                  </div>
                  <div className={styles.wizardStepLabel}>{step.label}</div>
                  {index < ITEMS_WIZARD_STEPS.length - 1 ? (
                    <div
                      className={`${styles.wizardStepConnector} ${itemsWizardStep > step.id ? styles.wizardStepConnectorDone : ""}`}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>

        {itemsWizardStep === 1 ? (
          <div className={styles.wizardBody}>
            <div className={styles.wizardSection}>
              <h4 className={styles.wizardTitle}>Search and Add Products</h4>
              <div className={sharedFilterStyles.searchInput}>
                <Search size={18} className={sharedFilterStyles.searchIcon} />
                <input
                  value={variantSearch.query}
                  onChange={(e) => variantSearch.setQuery(e.target.value)}
                  placeholder="Search product variants by name / SKU"
                  className={sharedFilterStyles.search}
                  disabled={applyChangesLoading}
                />
                {variantSearch.query && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={sharedFilterStyles.clearSearch}
                    onClick={() => variantSearch.setQuery("")}
                    aria-label="Clear search"
                  >
                    <XIcon size={16} />
                  </Button>
                )}
              </div>

              {variantSearch.hasQuery ? (
                <div className={styles.wizardSearchResults}>
                  {variantSearch.loading ? (
                    <div className={styles.wizardEmptyState}>Searching...</div>
                  ) : variantSearch.error ? (
                    <div className={styles.wizardErrorState}>
                      {variantSearch.error}
                    </div>
                  ) : variantSearch.results.length === 0 ? (
                    <div className={styles.wizardEmptyState}>No results</div>
                  ) : (
                    (variantSearch.results as VariantSearchItem[]).map(
                      (variant) => (
                        <div
                          key={variant._id}
                          className={styles.searchResultRow}
                        >
                          <div className={styles.searchResultText}>
                            <div className={styles.searchResultName}>
                              {variant.product?.name
                                ? `${variant.product.name} • ${variant.name}`
                                : variant.name}
                            </div>
                            <div className={styles.searchResultMeta}>
                              {variant.sku || "-"}
                            </div>
                          </div>
                          <Input
                            type="number"
                            min={1}
                            value={String(searchQuantities[variant._id] ?? "1")}
                            onChange={(e) =>
                              setResultQuantity(variant._id, e.target.value)
                            }
                            className={styles.resultQtyInput}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => stageAddVariant(variant)}
                          >
                            Add
                          </Button>
                        </div>
                      ),
                    )
                  )}
                </div>
              ) : null}
            </div>

            <div className={styles.wizardTwoColumn}>
              <div className={styles.wizardSection}>
                <h4 className={styles.wizardTitle}>Products to Add</h4>
                {stagedAdds.length === 0 ? (
                  <div className={styles.wizardEmptyState}>
                    No products staged.
                  </div>
                ) : (
                  <div className={styles.stagedList}>
                    {stagedAdds.map((item) => (
                      <div key={item.variantId} className={styles.stagedRow}>
                        <div className={styles.stagedRowText}>
                          <div className={styles.stagedRowName}>
                            {item.name}
                          </div>
                          <div className={styles.stagedRowMeta}>
                            {item.sku || "-"}
                          </div>
                        </div>
                        <Input
                          type="number"
                          min={1}
                          value={String(item.quantity)}
                          onChange={(e) =>
                            setStagedAddQuantity(
                              item.variantId,
                              Number(e.target.value || 1),
                            )
                          }
                          className={styles.resultQtyInput}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeStagedAdd(item.variantId)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.wizardSection}>
                <h4 className={styles.wizardTitle}>Products to Remove</h4>
                <div className={styles.stagedList}>
                  {subscription.items.length === 0 ? (
                    <div className={styles.wizardEmptyState}>
                      No items in subscription.
                    </div>
                  ) : (
                    subscription.items.map((item) => {
                      const marked = stagedRemoveIds.includes(item._id);
                      return (
                        <div key={item._id} className={styles.stagedRow}>
                          <div className={styles.stagedRowText}>
                            <div className={styles.stagedRowName}>
                              {item.name}
                            </div>
                            <div className={styles.stagedRowMeta}>
                              {item.sku} • Qty {item.quantity}
                            </div>
                          </div>
                          <Button
                            variant={marked ? "danger" : "outline"}
                            size="sm"
                            onClick={() => toggleStagedRemoval(item._id)}
                          >
                            {marked ? "Undo" : "Remove"}
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {itemsWizardStep === 2 ? (
          <div className={styles.wizardBody}>
            <div className={styles.wizardSection}>
              <h4 className={styles.wizardTitle}>Summary of Changes</h4>
              <div className={styles.summaryStats}>
                <span>Additions: {stagedAdds.length}</span>
                <span>Removals: {itemsMarkedForRemoval.length}</span>
                <span>
                  Added Units:{" "}
                  {stagedAdds.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
              </div>
            </div>

            <div className={styles.wizardTwoColumn}>
              <div className={styles.wizardSection}>
                <h4 className={styles.wizardTitle}>Will be Added</h4>
                {stagedAdds.length === 0 ? (
                  <div className={styles.wizardEmptyState}>
                    No products will be added.
                  </div>
                ) : (
                  <div className={styles.stagedList}>
                    {stagedAdds.map((item) => (
                      <div
                        key={item.variantId}
                        className={styles.stagedRowCompact}
                      >
                        <span>{item.name}</span>
                        <span>Qty {item.quantity}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.wizardSection}>
                <h4 className={styles.wizardTitle}>Will be Removed</h4>
                {itemsMarkedForRemoval.length === 0 ? (
                  <div className={styles.wizardEmptyState}>
                    No products will be removed.
                  </div>
                ) : (
                  <div className={styles.stagedList}>
                    {itemsMarkedForRemoval.map((item) => (
                      <div key={item._id} className={styles.stagedRowCompact}>
                        <span>{item.name}</span>
                        <span>Qty {item.quantity}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}

        {itemsWizardStep === 3 ? (
          <div className={styles.wizardBody}>
            <div className={styles.wizardSection}>
              <h4 className={styles.wizardTitle}>Confirm Changes</h4>
              <p className={styles.confirmText}>
                This will apply {stagedAdds.length} additions and{" "}
                {itemsMarkedForRemoval.length} removals to the subscription.
              </p>
              <p className={styles.confirmSubtext}>
                You can go back to edit selections before applying.
              </p>
            </div>
          </div>
        ) : null}

        <ModalFooter>
          <div className={styles.wizardFooter}>
            <Button variant="ghost" onClick={closeItemsWizard}>
              Cancel
            </Button>

            <div className={styles.wizardFooterActions}>
              {itemsWizardStep > 1 ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    if (itemsWizardStep === 3) setItemsWizardStep(2);
                    else if (itemsWizardStep === 2) setItemsWizardStep(1);
                  }}
                >
                  Back
                </Button>
              ) : null}

              {itemsWizardStep < 3 ? (
                <Button
                  variant="primary"
                  onClick={() => {
                    if (itemsWizardStep === 1) setItemsWizardStep(2);
                    else if (itemsWizardStep === 2) setItemsWizardStep(3);
                  }}
                  disabled={itemsWizardStep === 1 && !hasPendingChanges}
                >
                  Next
                </Button>
              ) : (
                <Button
                  variant="primary"
                  onClick={applyItemChanges}
                  isLoading={applyChangesLoading}
                  disabled={!hasPendingChanges}
                >
                  Confirm Changes
                </Button>
              )}
            </div>
          </div>
        </ModalFooter>
      </Modal>
    </div>
  );
}
