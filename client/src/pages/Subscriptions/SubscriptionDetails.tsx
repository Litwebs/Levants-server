import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Button,
  Card,
  DataTableCard,
  Modal,
  ModalFooter,
  Select,
  Table,
} from "../../components/common";
import sharedTableStyles from "../../components/common/DataTableCard/DataTableCard.module.css";
import {
  useSubscriptions,
  type Subscription,
  type SubscriptionDelivery,
  type SubscriptionOrder,
  type SubscriptionPayment,
} from "../../context/Subscriptions";
import { useToast } from "../../components/common/Toast";
import { usePermissions } from "@/hooks/usePermissions";
import {
  ArrowLeft,
  LockKeyhole,
  Loader2,
  RefreshCw,
  Trash2,
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
  pending: "Pending setup",
};

type TabId = "overview" | "deliveries" | "orders" | "payments";

type ListMeta = {
  page: number;
  pageSize: number;
  total: number;
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

const getRequestError = (error: unknown, fallback: string) => {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { message?: unknown } } })
      .response;
    if (typeof response?.data?.message === "string") return response.data.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
};

export default function SubscriptionDetailsPage() {
  const { subscriptionId = "" } = useParams<{ subscriptionId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();
  const canUpdateSubscription = hasPermission("orders.update");
  const {
    getSubscription,
    getSubscriptionDeliveries,
    getSubscriptionOrders,
    getSubscriptionPayments,
    updateSubscription,
    pauseSubscription,
    resumeSubscription,
    cancelSubscription,
    deletePendingSubscription,
  } = useSubscriptions();

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
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelModalReason, setCancelModalReason] = useState("");
  const [isDeletePendingModalOpen, setIsDeletePendingModalOpen] =
    useState(false);

  const hydrateEditor = (value: Subscription) => {
    setStatusDraft(value.status === "pending" ? "active" : value.status);
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
    if (!subscription || subscription.isPendingSetup) return false;
    return (
      frequency !== subscription.frequency ||
      Number(preferredDeliveryDay) !==
        Number(subscription.preferredDeliveryDay) ||
      notes.trim() !== String(subscription.notes || "").trim() ||
      statusDraft !== subscription.status
    );
  }, [frequency, preferredDeliveryDay, notes, statusDraft, subscription]);

  const isPendingSetup = Boolean(subscription?.isPendingSetup);

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
    } catch (error: unknown) {
      setError(getRequestError(error, "Failed to load subscription"));
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
    if (!subscription || !canUpdateSubscription) return;
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
    } catch (error: unknown) {
      showToast({
        type: "error",
        title: getRequestError(error, "Failed to update subscription"),
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
    if (
      !subscription ||
      !canUpdateSubscription ||
      subscription.status === "cancelled"
    )
      return;
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
    } catch (error: unknown) {
      showToast({
        type: "error",
        title: getRequestError(error, "Failed to cancel subscription"),
      });
    } finally {
      setActionBusy(false);
    }
  };

  const handleDeletePending = async () => {
    if (!subscription?.isPendingSetup || !canUpdateSubscription) return;
    setActionBusy(true);
    try {
      await deletePendingSubscription(subscription._id);
      showToast({
        type: "success",
        title: "Pending subscription setup deleted",
      });
      navigate("/subscriptions");
    } catch (error: unknown) {
      showToast({
        type: "error",
        title: getRequestError(error, "Failed to delete pending setup"),
      });
    } finally {
      setActionBusy(false);
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
            {isPendingSetup
              ? "Awaiting setup"
              : formatDate(subscription.nextDeliveryDate)}
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
        {!isPendingSetup && (
          <>
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
          </>
        )}
      </div>

      {tab === "overview" ? (
        <div className={styles.overviewGrid}>
          {isPendingSetup ? (
            <Card className={`${styles.sectionCard} ${styles.pendingSetupCard}`}>
              <div>
                <h3 className={styles.sectionTitle}>Customer setup required</h3>
                <p className={styles.sectionDescription}>
                  This subscription has been prepared, but it will not create
                  deliveries or payments until the customer verifies their account
                  and adds a payment method.
                </p>
              </div>
              <div className={styles.pendingSetupFacts}>
                <div>
                  <span className={styles.infoLabel}>Prepared</span>
                  <span className={styles.infoValue}>
                    {formatDate(subscription.createdAt)}
                  </span>
                </div>
                <div>
                  <span className={styles.infoLabel}>Setup link expires</span>
                  <span className={styles.infoValue}>
                    {formatDate(subscription.setupExpiresAt)}
                  </span>
                </div>
                <div>
                  <span className={styles.infoLabel}>Delivery days</span>
                  <span className={styles.infoValue}>
                    {(subscription.preferredDeliveryDays?.length
                      ? subscription.preferredDeliveryDays
                      : [subscription.preferredDeliveryDay]
                    )
                      .map((day) => DAY_OPTIONS.find((option) => Number(option.value) === day)?.label)
                      .filter(Boolean)
                      .join(", ") || "-"}
                  </span>
                </div>
              </div>
              {canUpdateSubscription ? (
                <div className={styles.pendingSetupActions}>
                  <div>
                    <strong>Remove this pending setup</strong>
                    <p>
                      The customer will remain in Customers, but their setup
                      link will stop working immediately.
                    </p>
                  </div>
                  <Button
                    variant="danger"
                    size="sm"
                    leftIcon={<Trash2 size={16} />}
                    onClick={() => setIsDeletePendingModalOpen(true)}
                  >
                    Delete pending setup
                  </Button>
                </div>
              ) : null}
            </Card>
          ) : (
          <Card className={styles.sectionCard}>
            <h3 className={styles.sectionTitle}>Manage Subscription</h3>
            {!canUpdateSubscription && (
              <div className={styles.settingsPermissionNote} role="note">
                You have read-only access to subscription settings.
              </div>
            )}
            <div className={styles.formGrid}>
              <Select
                label="Status"
                value={statusDraft}
                onChange={(value) =>
                  setStatusDraft(value as "active" | "paused" | "cancelled")
                }
                options={statusOptions}
                disabled={
                  !canUpdateSubscription || subscription.status === "cancelled"
                }
              />
              <Select
                label="Frequency"
                value={frequency}
                onChange={setFrequency}
                options={FREQUENCY_OPTIONS}
                disabled={!canUpdateSubscription}
              />
              <Select
                label="Preferred Delivery Day"
                value={preferredDeliveryDay}
                onChange={setPreferredDeliveryDay}
                options={DAY_OPTIONS}
                disabled={!canUpdateSubscription}
              />
              <div className={styles.fullWidth}>
                <label className={styles.fieldLabel}>Notes</label>
                <textarea
                  className={styles.notesInput}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Subscription notes"
                  rows={4}
                  disabled={!canUpdateSubscription}
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
                  disabled={
                    !canUpdateSubscription || !hasFormChanges || actionBusy
                  }
                >
                  Save Changes
                </Button>
                {canUpdateSubscription && subscription.status !== "cancelled" && (
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
          )}

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
            <div className={styles.itemsSectionHeader}>
              <div>
                <h3 className={styles.sectionTitle}>Subscription Items</h3>
                <p className={styles.sectionDescription}>
                  Products and quantities currently included in this subscription.
                </p>
              </div>
              <span className={styles.itemCount}>
                {subscription.items.length} product{subscription.items.length === 1 ? "" : "s"}
              </span>
            </div>

            <div className={styles.readOnlyNotice} role="note">
              <span className={styles.readOnlyNoticeIcon} aria-hidden="true">
                <LockKeyhole size={17} />
              </span>
              <div>
                <strong>Products are read-only for admins</strong>
                <p>
                  You can review the current items, but products and quantities
                  cannot be added, removed, or changed here.
                </p>
              </div>
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
              <Table
                withWrapper={false}
                tableClassName={sharedTableStyles.table}
              >
                <thead>
                  <tr>
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
                        colSpan={5}
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
                        <tr key={item._id}>
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

      <Modal
        isOpen={isDeletePendingModalOpen}
        onClose={() => {
          if (actionBusy) return;
          setIsDeletePendingModalOpen(false);
        }}
        title="Delete pending setup?"
        size="sm"
      >
        <div className={styles.cancelModalContent}>
          <p className={styles.cancelModalText}>
            This permanently removes the prepared subscription for{" "}
            <strong>{getCustomerName(subscription.customer)}</strong> and
            invalidates their setup link.
          </p>
          <p className={styles.cancelModalText}>
            The customer account and contact details will not be deleted.
          </p>
        </div>
        <ModalFooter>
          <Button
            variant="outline"
            onClick={() => setIsDeletePendingModalOpen(false)}
            disabled={actionBusy}
          >
            Keep setup
          </Button>
          <Button
            variant="danger"
            leftIcon={<Trash2 size={16} />}
            onClick={handleDeletePending}
            isLoading={actionBusy}
          >
            Delete pending setup
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

    </div>
  );
}
