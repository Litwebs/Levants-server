import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Edit3,
  Mail,
  MapPin,
  Phone,
  Save,
  ShoppingBag,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/common";
import { useToast } from "../../components/common/Toast";
import {
  useCustomers,
  type CreditTransaction,
  type Customer,
  type CustomerAddress,
} from "../../context/Customers";
import type {
  CustomerPayment,
  CustomerSubscription,
  CustomersListMeta,
  Order,
  OrderStats,
} from "../../context/Customers/constants";
import { usePermissions } from "@/hooks/usePermissions";
import styles from "./CustomerDetails.module.css";

type EditForm = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  status: "active" | "disabled";
  address: {
    line1: string;
    line2: string;
    city: string;
    postcode: string;
    country: string;
  };
};

const emptyEditForm: EditForm = {
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
  status: "active",
  address: { line1: "", line2: "", city: "", postcode: "", country: "" },
};

const getDefaultAddress = (customer: Customer | null) => {
  const addresses = Array.isArray(customer?.addresses) ? customer.addresses : [];
  return addresses.find((address) => address.isDefault) || addresses[0] || null;
};

const toEditForm = (customer: Customer): EditForm => {
  const address = getDefaultAddress(customer);
  return {
    email: customer.email || "",
    firstName: customer.firstName || "",
    lastName: customer.lastName || "",
    phone: customer.phone || "",
    status: customer.status || "active",
    address: {
      line1: address?.line1 || "",
      line2: address?.line2 || "",
      city: address?.city || "",
      postcode: address?.postcode || "",
      country: address?.country || "",
    },
  };
};

const formatDate = (value?: string | null, includeTime = false) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
};

const formatCurrency = (amount?: number | null) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(Number(amount) || 0);

const formatCredit = (minor?: number | null) =>
  formatCurrency((Number(minor) || 0) / 100);

const badgeVariantForStatus = (value?: string) => {
  const status = String(value || "").toLowerCase();
  if (["active", "paid", "succeeded", "delivered"].includes(status)) {
    return "success" as const;
  }
  if (["pending", "paused", "scheduled"].includes(status)) {
    return "warning" as const;
  }
  if (["disabled", "cancelled", "failed", "refunded"].includes(status)) {
    return "error" as const;
  }
  return "default" as const;
};

const CREDIT_TYPE_LABELS: Record<CreditTransaction["type"], string> = {
  subscription_refund: "Subscription refund",
  order_redemption: "Used on order",
  order_redemption_reversal: "Order credit returned",
  admin_adjustment: "Admin adjustment",
};

const getRequestError = (error: unknown, fallback: string) => {
  if (error && typeof error === "object" && "response" in error) {
    const response = (error as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === "string") return response.data.message;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

const PermissionNotice = ({ children }: { children: string }) => (
  <div className={styles.permissionNotice}>{children}</div>
);

export default function CustomerDetailsPage() {
  const { customerId = "" } = useParams<{ customerId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { hasPermission } = usePermissions();
  const {
    getCustomerById,
    updateCustomer,
    listCustomerOrders,
    listCustomerSubscriptions,
    listCustomerPayments,
    getCustomerCredit,
    adjustCustomerCredit,
  } = useCustomers();

  const canEdit = hasPermission("customers.update");
  const canReadOrders = hasPermission("orders.read");
  const canReadCredit = hasPermission("customers.credit.read");
  const canUpdateCredit = hasPermission("customers.credit.update");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm);

  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersMeta, setOrdersMeta] = useState<CustomersListMeta | null>(null);
  const [orderStats, setOrderStats] = useState<OrderStats | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize, setOrdersPageSize] = useState(10);
  const [ordersError, setOrdersError] = useState<string | null>(null);

  const [subscriptions, setSubscriptions] = useState<CustomerSubscription[]>([]);
  const [subscriptionsLoading, setSubscriptionsLoading] = useState(false);
  const [subscriptionsError, setSubscriptionsError] = useState<string | null>(null);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);

  const [creditBalance, setCreditBalance] = useState(0);
  const [creditTransactions, setCreditTransactions] = useState<CreditTransaction[]>([]);
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustingCredit, setAdjustingCredit] = useState(false);

  const loadCustomer = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await getCustomerById(customerId);
      setCustomer(result);
      setEditForm(toEditForm(result));
    } catch (requestError: unknown) {
      setError(getRequestError(requestError, "Failed to load customer"));
    } finally {
      setLoading(false);
    }
  }, [customerId, getCustomerById]);

  useEffect(() => {
    void loadCustomer();
  }, [loadCustomer]);

  useEffect(() => {
    if (!customerId || !canReadOrders) return;
    setOrdersLoading(true);
    setOrdersError(null);
    listCustomerOrders(customerId, { page: ordersPage, pageSize: ordersPageSize })
      .then((result) => {
        setOrders(result.orders);
        setOrdersMeta(result.meta);
        setOrderStats(result.stats);
      })
      .catch((requestError: unknown) => {
        setOrdersError(getRequestError(requestError, "Failed to load orders"));
      })
      .finally(() => setOrdersLoading(false));
  }, [canReadOrders, customerId, listCustomerOrders, ordersPage, ordersPageSize]);

  useEffect(() => {
    if (!customerId || !canReadOrders || activeTab !== "subscriptions") return;
    setSubscriptionsLoading(true);
    setSubscriptionsError(null);
    listCustomerSubscriptions(customerId, { page: 1, pageSize: 50 })
      .then((result) => setSubscriptions(result.subscriptions))
      .catch((requestError: unknown) => {
        setSubscriptionsError(getRequestError(requestError, "Failed to load subscriptions"));
      })
      .finally(() => setSubscriptionsLoading(false));
  }, [activeTab, canReadOrders, customerId, listCustomerSubscriptions]);

  useEffect(() => {
    if (!customerId || !canReadOrders || activeTab !== "payments") return;
    setPaymentsLoading(true);
    setPaymentsError(null);
    listCustomerPayments(customerId, { page: 1, pageSize: 50 })
      .then((result) => setPayments(result.payments))
      .catch((requestError: unknown) => {
        setPaymentsError(getRequestError(requestError, "Failed to load payments"));
      })
      .finally(() => setPaymentsLoading(false));
  }, [activeTab, canReadOrders, customerId, listCustomerPayments]);

  const loadCredit = useCallback(() => {
    if (!customerId || !canReadCredit) return;
    setCreditLoading(true);
    setCreditError(null);
    getCustomerCredit(customerId, { page: 1, pageSize: 50 })
      .then((result) => {
        setCreditBalance(result.balance);
        setCreditTransactions(result.transactions);
      })
      .catch((requestError: unknown) => {
        setCreditError(getRequestError(requestError, "Failed to load store credit"));
      })
      .finally(() => setCreditLoading(false));
  }, [canReadCredit, customerId, getCustomerCredit]);

  useEffect(() => {
    if (activeTab === "overview" || activeTab === "credit") loadCredit();
  }, [activeTab, loadCredit]);

  const fullName = useMemo(
    () => `${customer?.firstName || ""} ${customer?.lastName || ""}`.trim(),
    [customer?.firstName, customer?.lastName],
  );
  const initials = (fullName || customer?.email || "Customer")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  const setAddressField = (field: keyof EditForm["address"], value: string) => {
    setEditForm((previous) => ({
      ...previous,
      address: { ...previous.address, [field]: value },
    }));
  };

  const cancelEditing = () => {
    if (customer) setEditForm(toEditForm(customer));
    setEditing(false);
  };

  const goBack = () => {
    if (
      editing &&
      !window.confirm("Discard your unsaved customer changes?")
    ) {
      return;
    }
    navigate("/customers");
  };

  const saveCustomer = async () => {
    if (!customer || !canEdit) return;
    if (!editForm.firstName.trim() || !editForm.lastName.trim() || !editForm.email.trim()) {
      showToast({
        type: "error",
        title: "Missing customer details",
        message: "First name, last name, and email are required.",
      });
      return;
    }

    const addressValues = Object.values(editForm.address).map((value) => value.trim());
    const hasAddress = addressValues.some(Boolean);
    if (
      hasAddress &&
      (!editForm.address.line1.trim() ||
        !editForm.address.city.trim() ||
        !editForm.address.postcode.trim() ||
        !editForm.address.country.trim())
    ) {
      showToast({
        type: "error",
        title: "Incomplete address",
        message: "Address line 1, city, postcode, and country are required.",
      });
      return;
    }

    if (
      customer.status !== "disabled" &&
      editForm.status === "disabled" &&
      !window.confirm(
        "Disable this customer account? They will no longer be able to sign in.",
      )
    ) {
      return;
    }

    const address: CustomerAddress | undefined = hasAddress
      ? {
          line1: editForm.address.line1.trim(),
          line2: editForm.address.line2.trim() || null,
          city: editForm.address.city.trim(),
          postcode: editForm.address.postcode.trim(),
          country: editForm.address.country.trim(),
          isDefault: true,
        }
      : undefined;

    setSaving(true);
    try {
      const updated = await updateCustomer(customer._id, {
        email: editForm.email.trim().toLowerCase(),
        firstName: editForm.firstName.trim(),
        lastName: editForm.lastName.trim(),
        phone: editForm.phone.trim() || null,
        status: editForm.status,
        ...(address ? { address } : {}),
      });
      setCustomer(updated);
      setEditForm(toEditForm(updated));
      setEditing(false);
      showToast({ type: "success", title: "Customer details updated" });
    } catch (requestError: unknown) {
      showToast({
        type: "error",
        title: "Failed to update customer",
        message: getRequestError(requestError, "Request failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const applyCreditAdjustment = async () => {
    const amount = Number(adjustAmount);
    if (!Number.isFinite(amount) || amount === 0 || !adjustReason.trim()) {
      setCreditError("Enter a non-zero amount and a reason.");
      return;
    }
    setAdjustingCredit(true);
    setCreditError(null);
    try {
      const result = await adjustCustomerCredit(customerId, {
        amount,
        reason: adjustReason.trim(),
      });
      setCreditBalance(result.balance);
      setAdjustAmount("");
      setAdjustReason("");
      loadCredit();
      showToast({ type: "success", title: "Store credit updated" });
    } catch (requestError: unknown) {
      setCreditError(getRequestError(requestError, "Failed to adjust credit"));
    } finally {
      setAdjustingCredit(false);
    }
  };

  if (loading) {
    return <div className={styles.statePage}>Loading customer details…</div>;
  }

  if (error || !customer) {
    return (
      <div className={styles.statePage}>
        <h2>Customer unavailable</h2>
        <p>{error || "Customer not found"}</p>
        <Button variant="outline" onClick={() => navigate("/customers")}>
          <ArrowLeft size={16} /> Back to customers
        </Button>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Button variant="ghost" onClick={goBack}>
          <ArrowLeft size={17} /> Customers
        </Button>
        <div className={styles.topActions}>
          {editing ? (
            <>
              <Button variant="outline" onClick={cancelEditing} disabled={saving}>
                <X size={16} /> Cancel
              </Button>
              <Button onClick={saveCustomer} isLoading={saving}>
                <Save size={16} /> Save changes
              </Button>
            </>
          ) : (
            canEdit && (
              <Button onClick={() => { setActiveTab("overview"); setEditing(true); }}>
                <Edit3 size={16} /> Edit customer
              </Button>
            )
          )}
        </div>
      </div>

      <Card className={styles.profileCard}>
        <div className={styles.avatar}>{initials}</div>
        <div className={styles.profileIdentity}>
          <div className={styles.profileTitleRow}>
            <h1>{fullName || customer.email}</h1>
            <Badge variant={customer.isGuest ? "default" : "success"} size="md">
              {customer.isGuest ? "Guest" : "Registered account"}
            </Badge>
            <Badge variant={badgeVariantForStatus(customer.status)} size="md">
              {customer.status || "active"}
            </Badge>
          </div>
          <div className={styles.profileMeta}>
            <span><Mail size={15} /> {customer.email}</span>
            <span><Phone size={15} /> {customer.phone || "No phone"}</span>
            <span><CalendarDays size={15} /> Customer since {formatDate(customer.createdAt)}</span>
          </div>
        </div>
      </Card>

      <Tabs
        defaultValue="overview"
        value={activeTab}
        onChange={(nextTab) => { if (!editing) setActiveTab(nextTab); }}
        className={styles.tabs}
      >
        {!editing && (
          <TabsList className={styles.tabsList}>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {canReadOrders && <TabsTrigger value="orders">Orders {ordersMeta?.total ? `(${ordersMeta.total})` : ""}</TabsTrigger>}
            {canReadOrders && <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>}
            {canReadOrders && <TabsTrigger value="payments">Payments</TabsTrigger>}
            {canReadCredit && <TabsTrigger value="credit">Store credit</TabsTrigger>}
          </TabsList>
        )}

        <TabsContent value="overview" className={styles.tabContent}>
          {editing ? (
            <Card className={styles.editCard}>
              <div className={styles.sectionHeading}>
                <div>
                  <h2>Edit customer details</h2>
                  <p>Changes apply to both guest and registered customer records.</p>
                </div>
              </div>
              <div className={styles.formGrid}>
                <Input label="First name" value={editForm.firstName} onChange={(event) => setEditForm((previous) => ({ ...previous, firstName: event.target.value }))} fullWidth />
                <Input label="Last name" value={editForm.lastName} onChange={(event) => setEditForm((previous) => ({ ...previous, lastName: event.target.value }))} fullWidth />
                <Input label="Email" type="email" value={editForm.email} onChange={(event) => setEditForm((previous) => ({ ...previous, email: event.target.value }))} hint={!customer.isGuest ? "Changing this requires the customer to verify the new address." : undefined} fullWidth />
                <Input label="Phone" type="tel" value={editForm.phone} onChange={(event) => setEditForm((previous) => ({ ...previous, phone: event.target.value }))} fullWidth />
                <Select label="Account status" value={editForm.status} onChange={(value) => setEditForm((previous) => ({ ...previous, status: value as EditForm["status"] }))} options={[{ value: "active", label: "Active" }, { value: "disabled", label: "Disabled" }]} />
              </div>
              <h3 className={styles.formSubheading}>Default address</h3>
              <p className={styles.formHint}>Changing this address preserves previous saved addresses and makes this one the default.</p>
              <div className={styles.formGrid}>
                <Input label="Address line 1" value={editForm.address.line1} onChange={(event) => setAddressField("line1", event.target.value)} fullWidth />
                <Input label="Address line 2" value={editForm.address.line2} onChange={(event) => setAddressField("line2", event.target.value)} fullWidth />
                <Input label="City" value={editForm.address.city} onChange={(event) => setAddressField("city", event.target.value)} fullWidth />
                <Input label="Postcode" value={editForm.address.postcode} onChange={(event) => setAddressField("postcode", event.target.value)} fullWidth />
                <Input label="Country" value={editForm.address.country} onChange={(event) => setAddressField("country", event.target.value)} fullWidth />
              </div>
            </Card>
          ) : (
            <>
              {(canReadOrders || canReadCredit) && <div className={styles.summaryGrid}>
                {canReadOrders && <Card className={styles.summaryCard}>
                  <ShoppingBag size={20} />
                  <div><strong>{ordersLoading ? "…" : ordersMeta?.total || 0}</strong><span>Total orders</span></div>
                </Card>}
                {canReadOrders && <Card className={styles.summaryCard}>
                  <span className={styles.poundIcon}>£</span>
                  <div><strong>{ordersLoading ? "…" : formatCurrency(orderStats?.totalSpent)}</strong><span>Total spent</span></div>
                </Card>}
                {canReadOrders && <Card className={styles.summaryCard}>
                  <CreditCard size={20} />
                  <div><strong>{ordersLoading ? "…" : formatCurrency(orderStats?.averageOrderValue)}</strong><span>Average order</span></div>
                </Card>}
                {canReadCredit && <Card className={styles.summaryCard}>
                  <Wallet size={20} />
                  <div><strong>{creditLoading ? "…" : formatCredit(creditBalance)}</strong><span>Store credit</span></div>
                </Card>}
              </div>}

              <div className={styles.overviewGrid}>
                <Card className={styles.sectionCard}>
                  <div className={styles.sectionHeading}><h2>Account details</h2></div>
                  <dl className={styles.detailsList}>
                    <div><dt>Customer type</dt><dd>{customer.isGuest ? "Guest checkout" : "Registered account"}</dd></div>
                    <div><dt>Account status</dt><dd><Badge variant={badgeVariantForStatus(customer.status)}>{customer.status || "active"}</Badge></dd></div>
                    <div><dt>Email verification</dt><dd>{customer.emailVerifiedAt ? <span className={styles.verified}><CheckCircle2 size={15} /> Verified {formatDate(customer.emailVerifiedAt)}</span> : "Not verified"}</dd></div>
                    <div><dt>Last order</dt><dd>{formatDate(customer.lastOrderAt)}</dd></div>
                    <div><dt>Created</dt><dd>{formatDate(customer.createdAt, true)}</dd></div>
                    <div><dt>Last updated</dt><dd>{formatDate(customer.updatedAt, true)}</dd></div>
                    <div><dt>Customer ID</dt><dd className={styles.mono}>{customer._id}</dd></div>
                    <div><dt>Stripe customer</dt><dd className={styles.mono}>{customer.stripeCustomerId || "Not linked"}</dd></div>
                  </dl>
                </Card>

                <Card className={styles.sectionCard}>
                  <div className={styles.sectionHeading}><h2>Contact information</h2></div>
                  <div className={styles.contactDetails}>
                    <p><Mail size={17} /><span><small>Email</small>{customer.email}</span></p>
                    <p><Phone size={17} /><span><small>Phone</small>{customer.phone || "Not provided"}</span></p>
                  </div>
                  <div className={styles.sectionDivider} />
                  <h3 className={styles.formSubheading}>Notification preferences</h3>
                  <div className={styles.preferenceList}>
                    {[ ["Order updates", customer.notificationPreferences?.orderUpdates], ["Subscription updates", customer.notificationPreferences?.subscriptionUpdates], ["Delivery updates", customer.notificationPreferences?.deliveryUpdates], ["Promotions", customer.notificationPreferences?.promotions] ].map(([label, enabled]) => (
                      <span key={String(label)}><Badge variant={enabled ? "success" : "default"}>{enabled ? "On" : "Off"}</Badge>{String(label)}</span>
                    ))}
                  </div>
                </Card>
              </div>

              <Card className={styles.sectionCard}>
                <div className={styles.sectionHeading}>
                  <div><h2>Saved addresses</h2><p>{customer.addresses.length} address{customer.addresses.length === 1 ? "" : "es"}</p></div>
                </div>
                {customer.addresses.length ? (
                  <div className={styles.addressGrid}>
                    {customer.addresses.map((address, index) => (
                      <div className={styles.addressCard} key={address._id || `${address.postcode}-${index}`}>
                        <MapPin size={18} />
                        <div>
                          <div className={styles.addressTitle}>
                            <strong>{address.label || `Address ${index + 1}`}</strong>
                            {address.isDefault && <Badge variant="success">Default</Badge>}
                          </div>
                          {address.fullName && <p>{address.fullName}</p>}
                          <p>{address.line1}</p>
                          {address.line2 && <p>{address.line2}</p>}
                          <p>{address.city}, {address.postcode}</p>
                          <p>{address.country}</p>
                          {address.phone && <p className={styles.mutedLine}>{address.phone}</p>}
                          {address.deliveryInstructions && <p className={styles.instructions}>{address.deliveryInstructions}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <div className={styles.emptyState}>No saved addresses</div>}
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="orders" className={styles.tabContent}>
          <Card className={styles.sectionCard}>
            <div className={styles.sectionHeading}><div><h2>Order history</h2><p>All non-cancelled orders for this customer.</p></div></div>
            {!canReadOrders ? <PermissionNotice>Orders require the orders.read permission.</PermissionNotice> : ordersLoading ? <div className={styles.emptyState}>Loading orders…</div> : ordersError ? <div className={styles.errorState}>{ordersError}</div> : orders.length ? (
              <>
                <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Order</th><th>Date</th><th>Status</th><th>Items</th><th>Total</th></tr></thead><tbody>{orders.map((order) => <tr key={order._id}><td className={styles.mono}>{order.orderId || `#${order._id.slice(-8)}`}</td><td>{formatDate(order.createdAt)}</td><td><Badge variant={badgeVariantForStatus(order.status)}>{order.status}</Badge></td><td>{order.items?.reduce((total, item) => total + (item.quantity || 0), 0) || 0}</td><td>{formatCurrency(order.total)}</td></tr>)}</tbody></table></div>
                <div className={styles.pagination}><Select value={String(ordersPageSize)} onChange={(value) => { setOrdersPageSize(Number(value)); setOrdersPage(1); }} options={[{ value: "10", label: "10 / page" }, { value: "20", label: "20 / page" }, { value: "50", label: "50 / page" }]} /><span>Page {ordersPage} of {ordersMeta?.totalPages || 1}</span><Button size="sm" variant="outline" disabled={ordersPage <= 1} onClick={() => setOrdersPage((page) => page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={ordersPage >= (ordersMeta?.totalPages || 1)} onClick={() => setOrdersPage((page) => page + 1)}>Next</Button></div>
              </>
            ) : <div className={styles.emptyState}>No orders found</div>}
          </Card>
        </TabsContent>

        <TabsContent value="subscriptions" className={styles.tabContent}>
          <Card className={styles.sectionCard}>
            <div className={styles.sectionHeading}><div><h2>Subscriptions</h2><p>Current and previous recurring deliveries.</p></div></div>
            {!canReadOrders ? <PermissionNotice>Subscriptions require the orders.read permission.</PermissionNotice> : subscriptionsLoading ? <div className={styles.emptyState}>Loading subscriptions…</div> : subscriptionsError ? <div className={styles.errorState}>{subscriptionsError}</div> : subscriptions.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Subscription</th><th>Frequency</th><th>Status</th><th>Next delivery</th><th>Items</th></tr></thead><tbody>{subscriptions.map((subscription) => <tr key={subscription._id}><td className={styles.mono}>{subscription.subscriptionNumber || subscription._id.slice(-8)}</td><td>{subscription.frequency?.replace(/_/g, " ") || "—"}</td><td><Badge variant={badgeVariantForStatus(subscription.status)}>{subscription.status}</Badge></td><td>{formatDate(subscription.nextDeliveryDate)}</td><td>{subscription.items?.length || 0}</td></tr>)}</tbody></table></div> : <div className={styles.emptyState}>No subscriptions found</div>}
          </Card>
        </TabsContent>

        <TabsContent value="payments" className={styles.tabContent}>
          <Card className={styles.sectionCard}>
            <div className={styles.sectionHeading}><div><h2>Payment history</h2><p>Payments linked to this customer.</p></div></div>
            {!canReadOrders ? <PermissionNotice>Payments require the orders.read permission.</PermissionNotice> : paymentsLoading ? <div className={styles.emptyState}>Loading payments…</div> : paymentsError ? <div className={styles.errorState}>{paymentsError}</div> : payments.length ? <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th>Reference</th><th>Date</th><th>Status</th><th>Order / subscription</th><th>Amount</th></tr></thead><tbody>{payments.map((payment) => <tr key={payment._id}><td className={styles.mono}>{payment.providerReference || payment._id.slice(-8)}</td><td>{formatDate(payment.createdAt)}</td><td><Badge variant={badgeVariantForStatus(payment.status)}>{payment.status}</Badge></td><td>{payment.order?.orderId || payment.subscription?.subscriptionNumber || "—"}</td><td>{formatCurrency(payment.amount)}</td></tr>)}</tbody></table></div> : <div className={styles.emptyState}>No payments found</div>}
          </Card>
        </TabsContent>

        <TabsContent value="credit" className={styles.tabContent}>
          <Card className={styles.sectionCard}>
            <div className={styles.sectionHeading}><div><h2>Store credit</h2><p>Available balance and credit ledger.</p></div><strong className={styles.creditBalance}>{canReadCredit ? formatCredit(creditBalance) : "Restricted"}</strong></div>
            {!canReadCredit ? <PermissionNotice>Store credit requires the customers.credit.read permission.</PermissionNotice> : (
              <>
                {canUpdateCredit && <div className={styles.creditForm}><Input label="Amount (£)" type="number" step="0.01" placeholder="5.00 or -2.50" value={adjustAmount} onChange={(event) => setAdjustAmount(event.target.value)} /><Input label="Reason" placeholder="Reason for adjustment" value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} fullWidth /><Button onClick={applyCreditAdjustment} isLoading={adjustingCredit}>Apply adjustment</Button></div>}
                {creditError && <div className={styles.errorState}>{creditError}</div>}
                {creditLoading ? <div className={styles.emptyState}>Loading store credit…</div> : creditTransactions.length ? <div className={styles.ledger}>{creditTransactions.map((transaction) => <div key={transaction._id} className={styles.ledgerRow}><div><strong>{transaction.reason || CREDIT_TYPE_LABELS[transaction.type]}</strong><span>{CREDIT_TYPE_LABELS[transaction.type]} · {formatDate(transaction.createdAt, true)}</span></div><div className={transaction.amount >= 0 ? styles.creditPositive : styles.creditNegative}>{transaction.amount >= 0 ? "+" : "−"}{formatCredit(Math.abs(transaction.amount))}<small>Balance {formatCredit(transaction.balanceAfter)}</small></div></div>)}</div> : <div className={styles.emptyState}>No store credit activity</div>}
              </>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
