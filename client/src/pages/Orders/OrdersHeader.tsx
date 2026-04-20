import { Download, RefreshCw } from "lucide-react";
import { Button } from "../../components/common";
import styles from "./Orders.module.css";

const OrdersHeader = ({ filteredOrders, meta, exportToCSV, refresh }: any) => {
  const totalOrders = meta?.total ?? filteredOrders.length;

  return (
    <div className={styles.header}>
      <div>
        <h1 className={styles.title}>Orders</h1>
        <p className={styles.subtitle}>{totalOrders} orders found</p>
      </div>

      <div className={styles.headerActions}>
        {/* <Button
          variant="outline"
          leftIcon={<Download size={16} />}
          onClick={exportToCSV}
        >
          Export CSV
        </Button> */}
        <Button
          variant="outline"
          leftIcon={<RefreshCw size={16} />}
          onClick={refresh}
        >
          Refresh
        </Button>
      </div>
    </div>
  );
};

export default OrdersHeader;
