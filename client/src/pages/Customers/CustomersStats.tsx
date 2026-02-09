import { Card } from "../../components/common";
import styles from "./Customers.module.css";

const CustomersStats = ({ stats }: any) => (
  <div className={styles.statsGrid}>
    <Card className={styles.statCard}>
      <span>Total Customers</span>
      <span>{stats.total}</span>
    </Card>

    <Card className={styles.statCard}>
      <span>Marketing Opt-In</span>
      <span>{stats.withMarketing}</span>
    </Card>

    <Card className={styles.statCard}>
      <span>Total Revenue</span>
      <span>£{stats.totalRevenue.toFixed(2)}</span>
    </Card>
  </div>
);

export default CustomersStats;
