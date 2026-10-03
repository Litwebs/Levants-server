import { RefreshCw } from "lucide-react";
import { Button } from "../../components/common";
import type { OrdersPageState } from "./useOrders";
import styles from "./Orders.module.css";

type OrdersHeaderProps = Pick<
  OrdersPageState,
  "filteredOrders" | "meta" | "refresh" | "loading"
>;

const OrdersHeader = ({
  filteredOrders,
  meta,
  refresh,
  loading,
}: OrdersHeaderProps) => {
  const totalOrders = meta?.total ?? filteredOrders.length;

  return (
    <div className={styles.header}>
      <div>
        <h1 className={styles.title}>Orders</h1>
        <p className={styles.subtitle}>{totalOrders} orders found</p>
      </div>

      <div className={styles.headerActions}>
        <Button
          variant="outline"
          leftIcon={<RefreshCw size={16} />}
          onClick={() => void refresh()}
          disabled={loading}
        >
          Refresh
        </Button>
      </div>
    </div>
  );
};

export default OrdersHeader;
