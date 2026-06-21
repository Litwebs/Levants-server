import { AlertTriangle, Trash2 } from "lucide-react";
import {
  Button,
  DataTableCard,
  Modal,
  ModalFooter,
  Table,
} from "../../components/common";
import {
  getStatusBadge,
  getPaymentBadge,
  getOrderSourceBadge,
} from "./order.utils";
import styles from "./Orders.module.css";
import sharedTableStyles from "../../components/common/DataTableCard/DataTableCard.module.css";
import { useState } from "react";
import { usePermissions } from "@/hooks/usePermissions";

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
  deleteOrder,
}: any) => {
  const { hasPermission } = usePermissions();
  const canDeleteOrders = hasPermission("orders.delete");
  const total = meta?.total ?? filteredOrders?.length ?? 0;
  const totalPages = meta?.totalPages ?? 1;
  const [confirmOrder, setConfirmOrder] = useState<any | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const closeConfirm = () => {
    if (deleteLoading) return;
    setConfirmOrder(null);
  };

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

  const formatDeliveryDate = (value: string) => {
    return new Date(value).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  const confirmDelete = async () => {
    if (!confirmOrder || !deleteOrder) return;
    setDeleteLoading(true);
    try {
      const result = await deleteOrder(confirmOrder.id);
      if (result?.deleted) {
        setConfirmOrder(null);
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <DataTableCard
      className={styles.tableCard}
      loading={loading}
      loadingText="Loading..."
      pagination={{
        page,
        pageSize,
        total,
        totalPages,
        setPage,
        setPageSize,
        pageSizeOptions: [
          { value: "50", label: "50 - page" },
          { value: "100", label: "100 - page" },
          { value: "200", label: "200 - page" },
        ],
        loading,
      }}
    >
      <Table withWrapper={false} tableClassName={sharedTableStyles.table}>
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
            <th>Source</th>
            <th>Total</th>
            <th>Delivery Status</th>
            <th>Payment</th>
            <th>Delivery Date</th>
            <th></th>
          </tr>
        </thead>

        <tbody>
          {(filteredOrders?.length ?? 0) === 0 ? (
            <tr className={sharedTableStyles.emptyStateRow}>
              <td className={sharedTableStyles.emptyTableCell} colSpan={10}>
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
                <td className={styles.checkboxCol} data-label="Select">
                  <input
                    type="checkbox"
                    checked={selectedOrders.includes(order.id)}
                    onChange={() => toggleOrderSelection(order.id)}
                    onClick={(e) => e.stopPropagation()}
                    className={styles.checkbox}
                  />
                </td>

                <td className={styles.orderInfoCol} data-label="Order">
                  <div className={styles.orderCell}>
                    <span className={styles.orderNumber}>
                      {order.orderNumber}
                    </span>
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
                    <span className={styles.itemCount}>
                      {order.items.reduce(
                        (sum: number, item: any) => sum + item.quantity,
                        0,
                      )}
                    </span>
                    <span>items</span>
                  </div>
                </td>
                <td data-label="Source">
                  {getOrderSourceBadge(order.isManualImport)}
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

                <td className={styles.rowActionsCell} data-label="Actions">
                  {canDeleteOrders ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setConfirmOrder(order);
                      }}
                    >
                      <Trash2 size={16} />
                      Delete
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <Modal
        isOpen={!!confirmOrder}
        onClose={closeConfirm}
        title="Delete Order"
        size="sm"
      >
        <div className={styles.deleteConfirmContent}>
          <div className={styles.deleteConfirmIcon}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <p className={styles.deleteConfirmTitle}>Delete this order?</p>
            <p className={styles.deleteConfirmText}>
              {confirmOrder?.orderNumber
                ? `This will permanently delete ${confirmOrder.orderNumber}.`
                : "This will permanently delete the selected order."}
            </p>
          </div>
        </div>

        <ModalFooter>
          <Button
            variant="outline"
            onClick={closeConfirm}
            disabled={deleteLoading}
          >
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={confirmDelete}
            disabled={deleteLoading || !deleteOrder}
            isLoading={deleteLoading}
          >
            <Trash2 size={16} />
            Delete
          </Button>
        </ModalFooter>
      </Modal>
    </DataTableCard>
  );
};

export default OrdersTable;
