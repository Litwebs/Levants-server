import type {
  AnalyticsComparisonMode,
  AnalyticsDateRange,
  AnalyticsOrderSource,
} from "../../../context/Analytics";
import {
  defaultAnalyticsIntervalForRange,
} from "../../../context/Analytics";
import { Select } from "../../../components/common";
import styles from "../Dashboard.module.css";

type Props = {
  range: AnalyticsDateRange;
  orderSource: AnalyticsOrderSource;
  interval: any;
  comparison: AnalyticsComparisonMode;
  setFilters: (next: any) => void;
  dateRangeOptions: { value: AnalyticsDateRange; label: string }[];
  orderSourceOptions: { value: AnalyticsOrderSource; label: string }[];
  comparisonOptions: { value: AnalyticsComparisonMode; label: string }[];
  onViewOrders: () => void;
  onCreateProduct: () => void;
};

const DashboardHeader: React.FC<Props> = ({
  range,
  orderSource,
  interval,
  comparison,
  setFilters,
  dateRangeOptions,
  orderSourceOptions,
  comparisonOptions,
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
            onChange={(value) => {
              const nextRange = value as AnalyticsDateRange;
              setFilters({
                range: nextRange,
                orderSource,
                interval: defaultAnalyticsIntervalForRange(nextRange),
              });
            }}
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

          <Select
            value={comparison}
            onChange={(value) =>
              setFilters({
                range,
                orderSource,
                interval,
                comparison: value as AnalyticsComparisonMode,
              })
            }
            options={comparisonOptions}
          />
        </div>
      </div>
    </div>
  );
};

export default DashboardHeader;
