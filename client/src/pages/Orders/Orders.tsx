import styles from "./Orders.module.css";
import { useOrders } from "./useOrders";

import OrdersHeader from "./OrdersHeader";
import OrdersFilters from "./OrdersFilters";
import OrdersBulkActions from "./OrdersBulkActions";
import OrdersTable from "./OrdersTable";
import { PageContainer } from "../../components/common";

const Orders = () => {
  const ordersState = useOrders();
  return (
    <PageContainer
      className={`${styles.page} ${ordersState.showFilters ? styles.pageWithFilters : ""}`}
    >
      <OrdersHeader {...ordersState} />
      {ordersState.filterError || ordersState.error ? (
        <div className={styles.pageAlert} role="alert">
          {ordersState.filterError || ordersState.error}
        </div>
      ) : null}
      <OrdersFilters {...ordersState} />
      <OrdersBulkActions {...ordersState} />
      <OrdersTable {...ordersState} />
    </PageContainer>
  );
};

export default Orders;
