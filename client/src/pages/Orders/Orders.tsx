import styles from "./Orders.module.css";
import { useOrders } from "./useOrders";

import OrdersHeader from "./OrdersHeader";
import OrdersStatusTabs from "./OrdersStatusTabs";
import OrdersFilters from "./OrdersFilters";
import OrdersBulkActions from "./OrdersBulkActions";
import OrdersTable from "./OrdersTable";
import OrderDetailModal from "./OrderDetailModal";
import OrderStatusModal from "./OrderStatusModal";

const Orders = () => {
  const ordersState = useOrders();

  return (
    <div className={styles.page}>
      <OrdersHeader {...ordersState} />
      {/* <OrdersStatusTabs {...ordersState} /> */}
      <OrdersFilters {...ordersState} />
      <OrdersBulkActions {...ordersState} />
      <OrdersTable {...ordersState} />
      <OrderDetailModal {...ordersState} />
      <OrderStatusModal {...ordersState} />
    </div>
  );
};

export default Orders;
