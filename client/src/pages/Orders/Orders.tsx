import styles from "./Orders.module.css";
import { useOrders } from "./useOrders";

import OrdersHeader from "./OrdersHeader";
import OrdersFilters from "./OrdersFilters";
import OrdersBulkActions from "./OrdersBulkActions";
import OrdersTable from "./OrdersTable";
import { useNavigate } from "react-router-dom";
import OrderStatusModal from "./OrderStatusModal";

const Orders = () => {
  const ordersState = useOrders();
  const navigate = useNavigate();

  return (
    <div
      className={`${styles.page} ${ordersState.showFilters ? styles.pageWithFilters : ""}`}
    >
      <OrdersHeader {...ordersState} />
      <OrdersFilters {...ordersState} />
      <OrdersBulkActions {...ordersState} />
      <OrdersTable {...ordersState} openOrderDetails={(id: string) => navigate(`/orders/${id}`)} />
      <OrderStatusModal {...ordersState} />
    </div>
  );
};

export default Orders;
