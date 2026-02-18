import styles from "./Orders.module.css";

interface OrdersStatusTabsProps {
  statusFilter: string;
  setStatusFilter: (status: string) => void;
  statusCounts: Record<string, number>;
}

const OrdersStatusTabs = ({
  statusFilter,
  setStatusFilter,
  statusCounts,
}: OrdersStatusTabsProps) => {
  return (
    <div className={styles.statusTabs}>
      {Object.entries(statusCounts).map(([key, count]) => (
        <button
          key={key}
          className={`${styles.statusTab} ${
            statusFilter === key ? styles.active : ""
          }`}
          onClick={() => setStatusFilter(key)}
        >
          {key.replace(/_/g, " ")}
          <span className={styles.tabCount}>{count}</span>
        </button>
      ))}
    </div>
  );
};

export default OrdersStatusTabs;
