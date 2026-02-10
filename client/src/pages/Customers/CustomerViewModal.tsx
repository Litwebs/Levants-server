import {
  Modal,
  ModalFooter,
  Button,
  Badge,
  Select,
} from "../../components/common";
import { Mail, Phone, MapPin, ShoppingBag, Edit2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import styles from "./Customers.module.css";

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

const getOrderBadgeVariant = (status: string) => {
  const s = String(status || "").toLowerCase();

  if (s === "paid" || s === "completed" || s === "delivered") return "success";
  if (s === "refunded") return "warning";
  if (s === "cancelled" || s === "canceled" || s === "failed") return "error";
  if (s) return "info";
  return "default";
};

const CustomerViewModal = ({
  selectedCustomer,
  isViewModalOpen,
  setIsViewModalOpen,
  listCustomerOrders,
  handleEditCustomer,
}: any) => {
  if (!selectedCustomer) return null;

  const [orders, setOrders] = useState<any[]>([]);
  const [ordersMeta, setOrdersMeta] = useState<any>(null);
  const [ordersStats, setOrdersStats] = useState<any>(null);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize, setOrdersPageSize] = useState(10);

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

  return (
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
              <Badge variant={selectedCustomer.isGuest ? "default" : "success"}>
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
                <div key={order._id} className={styles.orderHistoryItem}>
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
  );
};

export default CustomerViewModal;
