import { Card } from "../../components/common";
import styles from "./Customers.module.css";

const CustomersStats = ({ stats }: any) => (
  <div className={styles.statsGrid}>
    <Card className={styles.statCard}>
      <span className={styles.statLabel}>Total Customers</span>
      <span className={styles.statValue}>{stats.total}</span>
    </Card>

    <Card className={styles.statCard}>
      <span className={styles.statLabel}>Marketing Opt-In</span>
      <span className={styles.statValue}>{stats.withMarketing}</span>
    </Card>

    <Card className={styles.statCard}>
      <span className={styles.statLabel}>Total Revenue</span>
      <span className={styles.statValue}>
        £{Number(stats.totalRevenue || 0).toFixed(2)}
      </span>
    </Card>
  </div>
);

export default CustomersStats;
