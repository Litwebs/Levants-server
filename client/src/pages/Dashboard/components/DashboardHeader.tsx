import type {
  AnalyticsDateRange,
  AnalyticsOrderSource,
} from "../../../context/Analytics";
import { Select } from "../../../components/common";
import styles from "../Dashboard.module.css";

type Props = {
  range: AnalyticsDateRange;
  orderSource: AnalyticsOrderSource;
  interval: any;
  setFilters: (next: any) => void;
  dateRangeOptions: { value: AnalyticsDateRange; label: string }[];
  orderSourceOptions: { value: AnalyticsOrderSource; label: string }[];
  onViewOrders: () => void;
  onCreateProduct: () => void;
};

const DashboardHeader: React.FC<Props> = ({
  range,
  orderSource,
  interval,
  setFilters,
  dateRangeOptions,
  orderSourceOptions,
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
                orderSource,
                interval,
              })
            }
            options={dateRangeOptions}
          />

          <Select
            value={orderSource}
            onChange={(value) =>
              setFilters({
                range,
                orderSource: value as AnalyticsOrderSource,
                interval,
              })
            }
            options={orderSourceOptions}
          />
        </div>
      </div>
    </div>
  );
};

export default DashboardHeader;
