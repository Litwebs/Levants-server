import { useEffect, useRef, useState } from "react";
import styles from "./Orders.module.css";
import { useOrders } from "./useOrders";

import OrdersHeader from "./OrdersHeader";
import OrdersFilters from "./OrdersFilters";
import OrdersBulkActions from "./OrdersBulkActions";
import OrdersTable from "./OrdersTable";
import { useNavigate } from "react-router-dom";
import OrderStatusModal from "./OrderStatusModal";
import { PageContainer } from "../../components/common";

const Orders = () => {
  const ordersState = useOrders();
  const navigate = useNavigate();
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const initialLoadStarted = useRef(false);

  useEffect(() => {
    if (ordersState.loading) {
      initialLoadStarted.current = true;
      return;
    }

    if (initialLoadStarted.current && !initialLoadComplete) {
      setInitialLoadComplete(true);
    }
  }, [initialLoadComplete, ordersState.loading]);

  return (
    <PageContainer
      className={`${styles.page} ${ordersState.showFilters ? styles.pageWithFilters : ""}`}
    >
      <OrdersHeader {...ordersState} />
      <OrdersFilters {...ordersState} />
      <OrdersBulkActions {...ordersState} />
      <OrdersTable
        {...ordersState}
        loading={ordersState.loading && initialLoadComplete}
        openOrderDetails={(id: string) => navigate(`/orders/${id}`)}
      />
      <OrderStatusModal {...ordersState} />
    </PageContainer>
  );
};

export default Orders;
