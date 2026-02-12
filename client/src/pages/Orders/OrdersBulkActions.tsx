import { Button, Card } from "../../components/common";
import styles from "./Orders.module.css";

interface Props {
  selectedOrders: string[];
  bulkUpdateStatus: (status: string) => void;
  setSelectedOrders: (ids: string[]) => void;
}

const OrdersBulkActions = ({
  selectedOrders,
  bulkUpdateStatus,
  setSelectedOrders,
}: Props) => {
  if (!selectedOrders.length) return null;

  return (
    <Card className={styles.bulkActions}>
      <div className={styles.bulkContent}>
        <span className={styles.bulkCount}>
          {selectedOrders.length} orders selected
        </span>

        <div className={styles.bulkButtons}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkUpdateStatus("paid")}
          >
            Mark Paid
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkUpdateStatus("pending")}
          >
            Mark Pending
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkUpdateStatus("cancelled")}
          >
            Mark Cancelled
          </Button>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSelectedOrders([])}
          >
            Clear Selection
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default OrdersBulkActions;
