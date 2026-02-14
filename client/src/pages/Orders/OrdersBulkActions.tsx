import { Button, Card } from "../../components/common";
import { usePermissions } from "@/hooks/usePermissions";
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
  const { hasPermission } = usePermissions();
  const canUpdateOrders = hasPermission("orders.update");

  if (!canUpdateOrders) return null;
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
            onClick={() => bulkUpdateStatus("ordered")}
          >
            Mark Ordered
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkUpdateStatus("dispatched")}
          >
            Mark Dispatched
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkUpdateStatus("in_transit")}
          >
            Mark In Transit
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkUpdateStatus("delivered")}
          >
            Mark Delivered
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => bulkUpdateStatus("returned")}
          >
            Mark Returned
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
