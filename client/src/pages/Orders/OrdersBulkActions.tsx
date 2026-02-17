import { Button, Card } from "../../components/common";
import { usePermissions } from "@/hooks/usePermissions";
import styles from "./Orders.module.css";
import { useState } from "react";

interface Props {
  selectedOrders: string[];
  bulkUpdateStatus: (status: string) => void | Promise<void>;
  bulkAssignDeliveryDate: (dateInput: string) => void | Promise<void>;
  setSelectedOrders: (ids: string[]) => void;
}

const OrdersBulkActions = ({
  selectedOrders,
  bulkUpdateStatus,
  bulkAssignDeliveryDate,
  setSelectedOrders,
}: Props) => {
  const { hasPermission } = usePermissions();
  const canUpdateOrders = hasPermission("orders.update");

  const [deliveryDate, setDeliveryDate] = useState("");
  const [isAssigning, setIsAssigning] = useState(false);

  if (!canUpdateOrders) return null;
  if (!selectedOrders.length) return null;

  return (
    <Card className={styles.bulkActions}>
      <div className={styles.bulkContent}>
        <span className={styles.bulkCount}>
          {selectedOrders.length} orders selected
        </span>

        <div className={styles.bulkButtons}>
          <input
            type="date"
            className={styles.filterInput}
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
          />

          <Button
            variant="outline"
            size="sm"
            isLoading={isAssigning}
            disabled={!deliveryDate}
            onClick={async () => {
              if (!deliveryDate) return;
              setIsAssigning(true);
              try {
                await bulkAssignDeliveryDate(deliveryDate);
                setDeliveryDate("");
              } finally {
                setIsAssigning(false);
              }
            }}
          >
            Assign Delivery Date
          </Button>

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
