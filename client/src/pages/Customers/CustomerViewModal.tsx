import {
  Modal,
  ModalFooter,
  Button,
  Badge,
  Select,
  Input,
} from "../../components/common";
import { Mail, Phone, MapPin, ShoppingBag, Edit2, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import styles from "./Customers.module.css";
import { useOrdersApi } from "../../context/Orders";
import { useCustomers, type CreditTransaction } from "../../context/Customers";
import { usePermissions } from "@/hooks/usePermissions";
import OrderDetailModal from "../Orders/OrderDetailModal";

const formatDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const formatCurrency = (amount: unknown) => {
  const n = typeof amount === "number" ? amount : Number(amount);
  if (Number.isNaN(n)) return "—";
  return `£${n.toFixed(2)}`;
};

const formatOrderId = (id: string) => {
  if (!id) return "—";
  return `#${String(id).slice(-8)}`;
};

const CREDIT_TYPE_LABELS: Record<CreditTransaction["type"], string> = {
  subscription_refund: "Subscription refund",
  order_redemption: "Used on order",
  order_redemption_reversal: "Order credit returned",
  admin_adjustment: "Adjustment",
};

const formatCredit = (minor: number) =>
  `£${((Number(minor) || 0) / 100).toFixed(2)}`;

const getOrderBadgeVariant = (status: string) => {
  const s = String(status || "").toLowerCase();

  if (s === "paid" || s === "completed" || s === "delivered") return "success";
  if (s === "refunded") return "warning";
  if (s === "cancelled" || s === "canceled" || s === "failed") return "error";
  if (s) return "info";
  return "default";
};

const getDefaultAddress = (customer: any) => {
  const addresses = Array.isArray(customer?.addresses)
    ? customer.addresses
    : [];
  return (
    addresses.find((a: any) => a?.isDefault) ||
    addresses[0] || {
      line1: "-",
      line2: null,
      city: "-",
      postcode: "-",
      country: "-",
    }
  );
};

const mapAdminOrderToUi = (order: any) => {
  const customer =
    order.customer && typeof order.customer === "object"
      ? order.customer
      : null;
  const addr = getDefaultAddress(customer);

  const customerName = customer
    ? `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim() ||
      customer.email
    : "-";

  return {
    id: order._id,
    orderNumber: order.orderId,

    customer: {
      name: customerName,
      email: customer?.email ?? "-",
      phone: customer?.phone ?? "-",
    },

    deliveryAddress: {
      line1: addr.line1 ?? "-",
      line2: addr.line2 ?? undefined,
      city: addr.city ?? "-",
      postcode: addr.postcode ?? "-",
    },

    deliverySlot: {
      date: order.createdAt,
      timeWindow: "-",
    },

    items: (order.items ?? []).map((i: any) => ({
      name: i.name,
      variant: i.sku,
      quantity: i.quantity,
      unitPrice: i.price,
    })),

    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    discount: 0,
    total: order.total,

    fulfillmentStatus: order.status,
    paymentStatus: order.status,

    history: [],

    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
};

const CustomerViewModal = ({
  selectedCustomer,
  isViewModalOpen,
  setIsViewModalOpen,
  listCustomerOrders,
  handleEditCustomer,
}: any) => {
  if (!selectedCustomer) return null;

  const { getOrderById, refundOrder } = useOrdersApi();
  const { getCustomerCredit, adjustCustomerCredit } = useCustomers();
  const { hasPermission } = usePermissions();
  const canReadCredit = hasPermission("customers.credit.read");
  const canUpdateCredit = hasPermission("customers.credit.update");

  const [orders, setOrders] = useState<any[]>([]);
  const [ordersMeta, setOrdersMeta] = useState<any>(null);
  const [ordersStats, setOrdersStats] = useState<any>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize, setOrdersPageSize] = useState(10);

  const [creditBalance, setCreditBalance] = useState(0);
  const [creditTxns, setCreditTxns] = useState<CreditTransaction[]>([]);
  const [creditLoading, setCreditLoading] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [isOrderDetailModalOpen, setIsOrderDetailModalOpen] = useState(false);

  const loadCredit = () => {
    if (!selectedCustomer?._id || !canReadCredit) return;
    setCreditLoading(true);
    setCreditError(null);
    getCustomerCredit(selectedCustomer._id, { page: 1, pageSize: 20 })
      .then((res) => {
        setCreditBalance(res.balance);
        setCreditTxns(res.transactions);
      })
      .catch((e: any) => {
        setCreditError(
          e?.response?.data?.message || "Failed to load store credit",
        );
      })
      .finally(() => setCreditLoading(false));
  };

  useEffect(() => {
    if (!isViewModalOpen) return;
    if (!selectedCustomer?._id) return;
    if (!canReadCredit) return;
    loadCredit();
    setAdjustAmount("");
    setAdjustReason("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isViewModalOpen, selectedCustomer?._id, canReadCredit]);

  const handleAdjustCredit = async () => {
    if (!selectedCustomer?._id) return;
    const amount = Number(adjustAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      setCreditError("Enter a non-zero amount (in £).");
      return;
    }
    if (!adjustReason.trim()) {
      setCreditError("A reason is required.");
      return;
    }
    try {
      setAdjustSaving(true);
      setCreditError(null);
      const res = await adjustCustomerCredit(selectedCustomer._id, {
        amount,
        reason: adjustReason.trim(),
      });
      setCreditBalance(res.balance);
      setAdjustAmount("");
      setAdjustReason("");
      loadCredit();
    } catch (e: any) {
      setCreditError(
        e?.response?.data?.message || "Failed to adjust store credit",
      );
    } finally {
      setAdjustSaving(false);
    }
  };

  useEffect(() => {
    if (!isViewModalOpen) return;
    setOrdersPage(1);
  }, [isViewModalOpen, selectedCustomer?._id]);

  useEffect(() => {
    if (!isViewModalOpen) return;
    if (!selectedCustomer?._id) return;
    if (typeof listCustomerOrders !== "function") return;

    setOrdersLoading(true);
    setOrdersError(null);

    listCustomerOrders(selectedCustomer._id, {
      page: ordersPage,
      pageSize: ordersPageSize,
    })
      .then((res: any) => {
        setOrders(Array.isArray(res?.orders) ? res.orders : []);
        setOrdersMeta(res?.meta ?? null);
        setOrdersStats(res?.stats ?? null);
      })
      .catch((e: any) => {
        setOrders([]);
        setOrdersMeta(null);
        setOrdersStats(null);
        setOrdersError(e?.response?.data?.message || "Failed to load orders");
      })
      .finally(() => setOrdersLoading(false));
  }, [
    isViewModalOpen,
    selectedCustomer?._id,
    listCustomerOrders,
    ordersPage,
    ordersPageSize,
  ]);

  const ordersTotal = ordersMeta?.total ?? orders.length;
  const ordersTotalPages = ordersMeta?.totalPages ?? 1;

  const orderStats = useMemo(() => {
    return {
      totalOrders: ordersMeta?.total ?? 0,
      totalSpent: ordersStats?.totalSpent ?? 0,
      averageOrderValue: ordersStats?.averageOrderValue ?? 0,
    };
  }, [ordersMeta?.total, ordersStats]);
  const fullName = `${selectedCustomer.firstName || ""} ${
    selectedCustomer.lastName || ""
  }`.trim();

  const openOrderDetails = async (orderId: string) => {
    setIsOrderDetailModalOpen(true);
    setSelectedOrder(null);
    try {
      const adminOrder = await getOrderById(orderId);
      setSelectedOrder(mapAdminOrderToUi(adminOrder));
    } catch {
      setIsOrderDetailModalOpen(false);
    }
  };

  const refundOrderFromModal = async (orderId: string) => {
    await refundOrder(orderId);
    const refreshed = await getOrderById(orderId);
    setSelectedOrder(mapAdminOrderToUi(refreshed));
  };

  return (
    <>
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Customer Details"
        size="lg"
      >
        <div className={styles.customerDetail}>
          <div className={styles.detailHeader}>
            <div className={styles.avatarLarge}>
              {(fullName || selectedCustomer.email || "U")
                .split(" ")
                .filter(Boolean)
                .slice(0, 2)
                .map((n: string) => n[0])
                .join("")
                .toUpperCase()}
            </div>
            <div className={styles.detailInfo}>
              <h2>{fullName || selectedCustomer.email}</h2>
              <div className={styles.detailMeta}>
                <Badge
                  variant={selectedCustomer.isGuest ? "default" : "success"}
                >
                  {selectedCustomer.isGuest ? "Guest" : "Customer"}
                </Badge>
              </div>
            </div>
          </div>

          <div className={styles.detailGrid}>
            <div className={styles.detailSection}>
              <h3>Contact Information</h3>
              <p
                style={{
                  display: "flex",
                  justifyContent: "flex-start",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Mail size={16} /> {selectedCustomer.email}
              </p>
              <p
                style={{
                  display: "flex",
                  justifyContent: "flex-start",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Phone size={16} /> {selectedCustomer.phone || "—"}
              </p>
            </div>

            <div className={styles.detailSection}>
              <h3>Addresses</h3>
              {selectedCustomer.addresses.map((addr: any, idx: number) => (
                <div
                  key={`${addr.postcode || "addr"}-${idx}`}
                  className={styles.addressCard}
                >
                  <MapPin size={16} />
                  <div>
                    <p>{addr.line1}</p>
                    {addr.line2 && <p>{addr.line2}</p>}
                    <p>
                      {addr.city}, {addr.postcode}
                    </p>
                    {addr.country && <p>{addr.country}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.detailSection}>
            <h3>Purchase Summary</h3>
            <div className={styles.purchaseSummary}>
              <div className={styles.summaryItem}>
                <ShoppingBag size={20} />
                <div>
                  <span className={styles.summaryValue}>
                    {orderStats.totalOrders}
                  </span>
                  <span className={styles.summaryLabel}>Total Orders</span>
                </div>
              </div>

              <div className={styles.summaryItem}>
                <span className={styles.currencyIcon}>£</span>
                <div>
                  <span className={styles.summaryValue}>
                    {formatCurrency(orderStats.totalSpent)}
                  </span>
                  <span className={styles.summaryLabel}>Total Spent</span>
                </div>
              </div>

              <div className={styles.summaryItem}>
                <span className={styles.currencyIcon}>Ø</span>
                <div>
                  <span className={styles.summaryValue}>
                    {formatCurrency(orderStats.averageOrderValue)}
                  </span>
                  <span className={styles.summaryLabel}>Avg Order Value</span>
                </div>
              </div>
            </div>
          </div>

          <div className={styles.detailSection}>
            <h3>Order History</h3>
            <div className={styles.orderHistory}>
              {ordersLoading ? (
                <p className={styles.noOrders}>Loading orders…</p>
              ) : ordersError ? (
                <p className={styles.noOrders}>{ordersError}</p>
              ) : orders.length > 0 ? (
                orders.map((order: any) => (
                  <div
                    key={order._id}
                    className={styles.orderHistoryItem}
                    role="button"
                    tabIndex={0}
                    onClick={() => openOrderDetails(order._id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openOrderDetails(order._id);
                      }
                    }}
                  >
                    <div className={styles.orderHistoryMain}>
                      <span className={styles.orderNumber}>
                        {formatOrderId(order._id)}
                      </span>
                      <span className={styles.orderDate}>
                        {order.createdAt ? formatDate(order.createdAt) : "—"}
                      </span>
                    </div>
                    <div className={styles.orderHistoryMeta}>
                      <Badge
                        variant={getOrderBadgeVariant(order.status)}
                        size="sm"
                      >
                        {order.status || "—"}
                      </Badge>
                      <span className={styles.orderAmount}>
                        {typeof order.total === "number"
                          ? formatCurrency(order.total)
                          : "—"}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <p className={styles.noOrders}>No orders found</p>
              )}
            </div>

            <div className={styles.orderPagination}>
              <div className={styles.orderPaginationInfo}>
                {ordersTotal ? `Total: ${ordersTotal}` : ""}
              </div>

              <div className={styles.orderPaginationControls}>
                <Select
                  className={styles.orderPageSizeSelect}
                  value={String(ordersPageSize)}
                  disabled={ordersLoading}
                  onChange={(v) => {
                    setOrdersPageSize(Number(v));
                    setOrdersPage(1);
                  }}
                  options={[
                    { value: "10", label: "10 / page" },
                    { value: "20", label: "20 / page" },
                    { value: "50", label: "50 / page" },
                  ]}
                />

                <Button
                  variant="outline"
                  size="sm"
                  disabled={ordersLoading || ordersPage <= 1}
                  onClick={() => setOrdersPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <span className={styles.orderPageLabel}>
                  Page {ordersPage} / {ordersTotalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={ordersLoading || ordersPage >= ordersTotalPages}
                  onClick={() =>
                    setOrdersPage((p) => Math.min(ordersTotalPages, p + 1))
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          </div>

          {canReadCredit && (
            <div className={styles.detailSection}>
              <h3
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <Wallet size={18} /> Store Credit
              </h3>

              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "8px",
                  marginBottom: "12px",
                }}
              >
                <span style={{ fontSize: "1.75rem", fontWeight: 600 }}>
                  {formatCredit(creditBalance)}
                </span>
                <span style={{ color: "var(--text-muted, #888)" }}>
                  available
                </span>
              </div>

              {canUpdateCredit && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    alignItems: "flex-end",
                    marginBottom: "12px",
                  }}
                >
                  <Input
                    label="Amount (£)"
                    type="number"
                    step="0.01"
                    placeholder="e.g. 5 or -2.50"
                    value={adjustAmount}
                    onChange={(e: any) => setAdjustAmount(e.target.value)}
                    style={{ width: "140px" }}
                  />
                  <Input
                    label="Reason"
                    placeholder="Reason for adjustment"
                    value={adjustReason}
                    onChange={(e: any) => setAdjustReason(e.target.value)}
                    style={{ flex: 1, minWidth: "200px" }}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={adjustSaving}
                    onClick={handleAdjustCredit}
                  >
                    {adjustSaving ? "Saving…" : "Apply"}
                  </Button>
                </div>
              )}

              {creditError && <p className={styles.noOrders}>{creditError}</p>}

              <div className={styles.orderHistory}>
                {creditLoading ? (
                  <p className={styles.noOrders}>Loading store credit…</p>
                ) : creditTxns.length > 0 ? (
                  creditTxns.map((tx) => (
                    <div key={tx._id} className={styles.orderHistoryItem}>
                      <div className={styles.orderHistoryMain}>
                        <span className={styles.orderNumber}>
                          {tx.reason || CREDIT_TYPE_LABELS[tx.type]}
                        </span>
                        <span className={styles.orderDate}>
                          {tx.createdAt ? formatDate(tx.createdAt) : "—"} ·{" "}
                          {CREDIT_TYPE_LABELS[tx.type]}
                        </span>
                      </div>
                      <div className={styles.orderHistoryMeta}>
                        <span
                          className={styles.orderAmount}
                          style={{
                            color:
                              tx.amount >= 0
                                ? "var(--success, #16a34a)"
                                : undefined,
                          }}
                        >
                          {tx.amount >= 0 ? "+" : "−"}
                          {formatCredit(Math.abs(tx.amount))}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className={styles.noOrders}>No store credit activity</p>
                )}
              </div>
            </div>
          )}

          <div className={styles.detailSection}>
            <h3>Account Info</h3>
            <p>
              Customer since:{" "}
              <strong>
                {selectedCustomer.createdAt
                  ? formatDate(selectedCustomer.createdAt)
                  : "—"}
              </strong>
            </p>
            {selectedCustomer.lastOrderAt && (
              <p>
                Last order:{" "}
                <strong>{formatDate(selectedCustomer.lastOrderAt)}</strong>
              </p>
            )}
          </div>
        </div>

        <ModalFooter>
          <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>
            Close
          </Button>
        </ModalFooter>
      </Modal>

      <OrderDetailModal
        selectedOrder={selectedOrder}
        isDetailModalOpen={isOrderDetailModalOpen}
        setIsDetailModalOpen={setIsOrderDetailModalOpen}
        refundOrder={refundOrderFromModal}
      />
    </>
  );
};

export default CustomerViewModal;
