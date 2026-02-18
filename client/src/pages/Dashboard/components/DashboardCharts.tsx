import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "../../../components/common";
import { SimpleBarChart, HorizontalBarChart } from "../../../components/charts";
import { formatCurrencyGBP } from "../../../lib/numberFormat";
import styles from "../Dashboard.module.css";

type Props = {
  revenueData: Array<{ label: string; value: number; highlight?: boolean }>;
  totalRevenue: number;
  topProducts: Array<{ label: string; value: number; percentage: number }>;
  revenueOverviewLoading: boolean;
};

const DashboardCharts: React.FC<Props> = ({
  revenueData,
  totalRevenue,
  topProducts,
  revenueOverviewLoading,
}) => {
  return (
    <div className={styles.chartsGrid}>
      <Card className={styles.chartCard}>
        <CardHeader>
          <CardTitle>Revenue Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <SimpleBarChart
            data={revenueData}
            type="bar"
            height={220}
            color="success"
            valueFormatter={(v) => formatCurrencyGBP(v, { compact: true })}
          />

          <div className={styles.chartFooter}>
            <span className={styles.chartTotal}>
              Total: {formatCurrencyGBP(totalRevenue)}
            </span>
          </div>

          {revenueOverviewLoading ? (
            <div className={styles.emptyState}>Loading revenue…</div>
          ) : null}
        </CardContent>
      </Card>

      <Card className={styles.chartCard}>
        <CardHeader>
          <CardTitle>Top Products</CardTitle>
        </CardHeader>
        <CardContent>
          {topProducts.length === 0 ? (
            <div className={styles.emptyState}>
              No top products for this period.
            </div>
          ) : (
            <HorizontalBarChart data={topProducts} color="primary" />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DashboardCharts;
