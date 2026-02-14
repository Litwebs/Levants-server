import { Eye, Plus } from "lucide-react";
import type { AnalyticsDateRange } from "../../../context/Analytics";
import { Button, Select } from "../../../components/common";
import styles from "../Dashboard.module.css";

type Props = {
  range: AnalyticsDateRange;
  interval: any;
  setFilters: (next: any) => void;
  dateRangeOptions: { value: AnalyticsDateRange; label: string }[];
  onViewOrders: () => void;
  onCreateProduct: () => void;
};

const DashboardHeader: React.FC<Props> = ({
  range,
  interval,
  setFilters,
  dateRangeOptions,
  onViewOrders,
  onCreateProduct,
}) => {
  return (
    <div className={styles.header}>
      <div>
        <h1 className={styles.title}>Dashboard</h1>
        <p className={styles.subtitle}>
          Welcome back! Here's what's happening today.
        </p>
      </div>

      <div className={styles.actions}>
        <div className={styles.filtersBar}>
          <Select
            value={range}
            onChange={(value) =>
              setFilters({
                range: value as AnalyticsDateRange,
                interval,
              })
            }
            options={dateRangeOptions}
          />
        </div>
      </div>
    </div>
  );
};

export default DashboardHeader;
