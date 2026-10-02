import { useMemo, type Dispatch, type SetStateAction } from "react";
import {
  Checkbox,
  DataTableCard,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/common";
import type { OrdersListMeta } from "../../context/Orders";
import type { Order } from "./useOrders";
import {
  getStatusBadge,
  getPaymentBadge,
  getOrderSourceBadge,
} from "./order.utils";
import styles from "./Orders.module.css";
import sharedTableStyles from "../../components/common/DataTableCard/DataTableCard.module.css";
import { Link } from "react-router-dom";

const PAGE_SIZE_OPTIONS = [
  { value: "50", label: "50 / page" },
  { value: "100", label: "100 / page" },
  { value: "200", label: "200 / page" },
];

interface OrdersTableProps {
  filteredOrders: Order[];
  selectedOrders: string[];
  toggleOrderSelection: (id: string) => void;
  toggleSelectAll: () => void;
  loading: boolean;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  pageSize: number;
  setPageSize: (size: number) => void;
  meta: OrdersListMeta | null;
}

const formatOrderCreatedAt = (value: string) => {
  const date = new Date(value);
  return `${date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  })}, ${date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
};

const formatDeliveryDate = (value: string) =>
  new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const OrdersTable = ({
  filteredOrders,
  selectedOrders,
  toggleOrderSelection,
  toggleSelectAll,
  loading,
  page,
  setPage,
  pageSize,
  setPageSize,
  meta,
}: OrdersTableProps) => {
  const total = meta?.total ?? filteredOrders?.length ?? 0;
  const totalPages = meta?.totalPages ?? 1;
  const selectedIds = useMemo(() => new Set(selectedOrders), [selectedOrders]);
  const visibleIds = useMemo(
    () => filteredOrders.map((order) => order.id),
    [filteredOrders],
  );
  const selectedVisibleCount = visibleIds.filter((id) => selectedIds.has(id)).length;
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && !allVisibleSelected;

  return (
    <DataTableCard
      className={styles.tableCard}
      loading={loading}
      loadingText="Loading orders…"
      pagination={{
        page,
        pageSize,
        total,
        totalPages,
        setPage,
        setPageSize,
        pageSizeOptions: PAGE_SIZE_OPTIONS,
        loading,
      }}
    >
      <Table withWrapper={false} tableClassName={sharedTableStyles.table}>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Checkbox
                aria-label="Select all orders"
                checked={allVisibleSelected}
                indeterminate={someVisibleSelected}
                onChange={toggleSelectAll}
                onClick={(e) => e.stopPropagation()}
              />
            </TableHead>
            <TableHead>Order</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Items</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Delivery Status</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead>Delivery Date</TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {(filteredOrders?.length ?? 0) === 0 ? (
            <TableRow className={sharedTableStyles.emptyStateRow}>
              <TableCell className={sharedTableStyles.emptyTableCell} colSpan={9}>
                No orders found.
              </TableCell>
            </TableRow>
          ) : (
            filteredOrders.map((order) => (
              <TableRow
                key={order.id}
                className={
                  selectedIds.has(order.id)
                    ? styles.selectedRow
                    : undefined
                }
              >
                <TableCell className={styles.checkboxCol} data-label="Select">
                  <Checkbox
                    aria-label={`Select order ${order.orderNumber}`}
                    checked={selectedIds.has(order.id)}
                    onChange={() => toggleOrderSelection(order.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </TableCell>

                <td className={styles.orderInfoCol} data-label="Order">
                  <div className={styles.orderCell}>
                    <Link to={`/orders/${order.id}`} className={styles.orderNumber} onClick={(event) => event.stopPropagation()}>
                      {order.orderNumber}
                    </Link>
                    <span className={styles.orderDate}>
                      {formatOrderCreatedAt(order.createdAt)}
                    </span>
                    {typeof order.customerInstructions === "string" &&
                    order.customerInstructions.trim() ? (
                      <span className={styles.orderInstructions}>
                        {order.customerInstructions.trim()}
                      </span>
                    ) : null}
                  </div>
                </td>

                <td className={styles.customerInfoCol} data-label="Customer">
                  <div className={styles.customerCell}>
                    <span className={styles.customerName}>
                      {order.customer.name}
                    </span>
                    <span className={styles.customerEmail}>
                      {order.customer.email}
                    </span>
                  </div>
                </td>

                <td data-label="Items">
                  <div className={styles.itemsCell}>
                    <span className={styles.itemCount}>{order.itemCount}</span>
                    <span>{order.itemCount === 1 ? "item" : "items"}</span>
                  </div>
                </td>
                <td data-label="Source">
                  {getOrderSourceBadge(
                    order.isManualImport,
                    order.isSubscriptionGenerated,
                  )}
                </td>

                <td data-label="Total">
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

                <td data-label="Delivery Status">
                  {getStatusBadge(order.deliveryStatus?.replace(/_/g, " "))}
                </td>
                <td data-label="Payment">
                  {getPaymentBadge(order.paymentStatus)}
                </td>

                <td
                  className={styles.deliveryInfoCol}
                  data-label="Delivery Date"
                >
                  <div className={styles.deliveryCell}>
                    {formatDeliveryDate(order.deliverySlot.date)}
                  </div>
                </td>

              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

    </DataTableCard>
  );
};

export default OrdersTable;
