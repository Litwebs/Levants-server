import { Eye, Edit, Printer, Package } from "lucide-react";
import { Card } from "../../components/common";
import { getStatusBadge, getPaymentBadge } from "./order.utils";
import styles from "./Orders.module.css";

const OrdersTable = ({
  filteredOrders,
  selectedOrders,
  toggleOrderSelection,
  toggleSelectAll,
  setSelectedOrder,
  setIsDetailModalOpen,
  setIsStatusModalOpen,
}: any) => {
  return (
    <Card className={styles.tableCard}>
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
              />
            </th>
            <th>Order</th>
            <th>Customer</th>
            <th>Items</th>
            <th>Total</th>
            <th>Status</th>
            <th>Payment</th>
            <th>Delivery</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {filteredOrders.map((order) => (
            <tr
              key={order.id}
              className={
                selectedOrders.includes(order.id)
                  ? styles.selectedRow
                  : undefined
              }
            >
              {/* Checkbox */}
              <td className={styles.checkboxCol}>
                <input
                  type="checkbox"
                  checked={selectedOrders.includes(order.id)}
                  onChange={() => toggleOrderSelection(order.id)}
                  className={styles.checkbox}
                />
              </td>

              {/* ORDER */}
              <td>
                <div className={styles.orderCell}>
                  <span className={styles.orderNumber}>
                    {order.orderNumber}
                  </span>
                  <span className={styles.orderDate}>
                    {new Date(order.createdAt).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                    ,{" "}
                    {new Date(order.createdAt).toLocaleTimeString("en-GB", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              </td>

              {/* CUSTOMER */}
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

              {/* ITEMS */}
              <td>
                <span className={styles.itemCount}>
                  {order.items.reduce((sum, item) => sum + item.quantity, 0)}{" "}
                  items
                </span>
              </td>

              {/* TOTAL */}
              <td>
                <span className={styles.total}>£{order.total.toFixed(2)}</span>
              </td>

              {/* STATUS */}
              <td>{getStatusBadge(order.fulfillmentStatus)}</td>

              {/* PAYMENT */}
              <td>{getPaymentBadge(order.paymentStatus)}</td>

              {/* DELIVERY */}
              <td>
                <div className={styles.deliveryCell}>
                  <span className={styles.deliveryDate}>
                    {new Date(order.deliverySlot.date).toLocaleDateString(
                      "en-GB",
                      { day: "numeric", month: "short" },
                    )}
                  </span>
                  <span className={styles.deliveryTime}>
                    {order.deliverySlot.timeWindow}
                  </span>
                </div>
              </td>

              {/* ACTIONS */}
              <td>
                <div className={styles.actions}>
                  <button
                    className={styles.actionBtn}
                    title="View"
                    onClick={() => {
                      setSelectedOrder(order);
                      setIsDetailModalOpen(true);
                    }}
                  >
                    <Eye size={16} />
                  </button>

                  <button
                    className={styles.actionBtn}
                    title="Update Status"
                    onClick={() => {
                      setSelectedOrder(order);
                      setIsStatusModalOpen(true);
                    }}
                  >
                    <Edit size={16} />
                  </button>

                  <button className={styles.actionBtn} title="Print">
                    <Printer size={16} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
};

export default OrdersTable;
