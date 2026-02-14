import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Card, Button, Select, CardFooter } from "../../components/common";
import { getStatusBadge, getPaymentBadge } from "./order.utils";
import styles from "./Orders.module.css";
import { useEffect, useState } from "react";

const OrdersTable = ({
  filteredOrders,
  selectedOrders,
  toggleOrderSelection,
  toggleSelectAll,
  setSelectedOrder,
  openOrderDetails,
  loading,
  page,
  setPage,
  pageSize,
  setPageSize,
  meta,
}: any) => {
  console.log("OrdersTable render", filteredOrders);
  const total = meta?.total ?? filteredOrders?.length ?? 0;
  const totalPages = meta?.totalPages ?? 1;
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(page * pageSize, total);

  const [paginationAction, setPaginationAction] = useState<
    "prev" | "next" | null
  >(null);
  useEffect(() => {
    if (!loading) setPaginationAction(null);
  }, [loading]);

  return (
    <Card className={styles.tableCard}>
      <div className={styles.tableArea}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>
                  <input
                    type="checkbox"
                    checked={
                      selectedOrders.length === filteredOrders.length &&
                      filteredOrders.length > 0
                    }
                    onChange={toggleSelectAll}
                    onClick={(e) => e.stopPropagation()}
                  />
                </th>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Delivery Status</th>
                <th>Payment</th>
                <th>Delivery Date</th>
              </tr>
            </thead>

            <tbody>
              {(filteredOrders?.length ?? 0) === 0 ? (
                <tr>
                  <td className={styles.emptyTableCell} colSpan={8}>
                    {loading ? "Loading orders…" : "No orders found."}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order: any) => (
                  <tr
                    key={order.id}
                    className={
                      selectedOrders.includes(order.id)
                        ? styles.selectedRow
                        : undefined
                    }
                    onClick={() => {
                      setSelectedOrder(order);
                      openOrderDetails?.(order.id);
                    }}
                  >
                    <td className={styles.checkboxCol}>
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order.id)}
                        onChange={() => toggleOrderSelection(order.id)}
                        onClick={(e) => e.stopPropagation()}
                        className={styles.checkbox}
                      />
                    </td>

                    <td>
                      <div className={styles.orderCell}>
                        <span className={styles.orderNumber}>
                          {order.orderNumber}
                        </span>
                        <span className={styles.orderDate}>
                          {new Date(order.createdAt).toLocaleDateString(
                            "en-GB",
                            {
                              day: "numeric",
                              month: "short",
                            },
                          )}
                          ,{" "}
                          {new Date(order.createdAt).toLocaleTimeString(
                            "en-GB",
                            {
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </span>
                      </div>
                    </td>

                    <td>
                      <div className={styles.customerCell}>
                        <span className={styles.customerName}>
                          {order.customer.name}
                        </span>
                        <span className={styles.customerEmail}>
                          {order.customer.email}
                        </span>
                      </div>
                    </td>

                    <td>
                      <span className={styles.itemCount}>
                        {order.items.reduce(
                          (sum: number, item: any) => sum + item.quantity,
                          0,
                        )}{" "}
                        items
                      </span>
                    </td>

                    <td>
                      <div className={styles.totalCell}>
                        <span className={styles.total}>
                          £{order.total.toFixed(2)}
                        </span>
                        {order.discount > 0 ? (
                          <span className={styles.discountNote}>
                            Discount −£{order.discount.toFixed(2)}
                          </span>
                        ) : null}
                      </div>
                    </td>

                    <td>
                      {getStatusBadge(order.deliveryStatus?.replace(/_/g, " "))}
                    </td>
                    <td>{getPaymentBadge(order.paymentStatus)}</td>

                    <td>
                      <div className={styles.deliveryCell}>
                        <span className={styles.deliveryDate}>
                          {new Date(order.deliverySlot.date).toLocaleDateString(
                            "en-GB",
                            { day: "numeric", month: "short", year: "numeric" },
                          )}
                        </span>
                        <span className={styles.deliveryTime}>
                          {order.deliverySlot.timeWindow}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {loading && (
          <div className={styles.tableLoadingOverlay} aria-live="polite">
            <div className={styles.tableLoadingInner}>
              <Loader2 size={16} className={styles.spinnerIcon} />
              Loading…
            </div>
          </div>
        )}
      </div>

      <CardFooter className={styles.paginationFooter}>
        <div className={styles.paginationInfo}>
          Showing {rangeStart}–{rangeEnd} of {total}
        </div>

        <div className={styles.paginationControls}>
          <Select
            className={styles.pageSizeSelect}
            value={String(pageSize)}
            disabled={loading}
            onChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
            options={[
              { value: "10", label: "10 / page" },
              { value: "20", label: "20 / page" },
              { value: "50", label: "50 / page" },
            ]}
          />

          <div className={styles.pageButtons}>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page <= 1}
              onClick={() => {
                setPaginationAction("prev");
                setPage((p: number) => Math.max(1, p - 1));
              }}
            >
              {loading && paginationAction === "prev" ? (
                <Loader2 size={14} className={styles.spinnerIcon} />
              ) : (
                <>
                  <ChevronLeft size={16} />
                  Prev
                </>
              )}
            </Button>

            <div className={styles.pageLabel}>
              Page {page} / {totalPages}
            </div>

            <Button
              variant="outline"
              size="sm"
              disabled={loading || page >= totalPages}
              onClick={() => {
                setPaginationAction("next");
                setPage((p: number) => Math.min(totalPages, p + 1));
              }}
            >
              {loading && paginationAction === "next" ? (
                <Loader2 size={14} className={styles.spinnerIcon} />
              ) : (
                <>
                  Next
                  <ChevronRight size={16} />
                </>
              )}
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
};

export default OrdersTable;
