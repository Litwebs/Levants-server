import { UserCheck, UserRound, Users } from "lucide-react";
import { Card } from "../../components/common";
import styles from "./Customers.module.css";

type CustomerStats = {
  total: number;
  registered: number;
  guests: number;
};

const CustomersStats = ({ stats, loading }: { stats: CustomerStats; loading: boolean }) => (
  <div className={styles.statsGrid}>
    <Card className={styles.statCard}>
      <span className={styles.statIcon}><Users size={20} /></span>
      <div>
        <span className={styles.statLabel}>Total customers</span>
        <span className={styles.statValue}>{loading && stats.total === 0 ? "—" : stats.total.toLocaleString()}</span>
      </div>
    </Card>

    <Card className={styles.statCard}>
      <span className={`${styles.statIcon} ${styles.registeredIcon}`}><UserCheck size={20} /></span>
      <div>
        <span className={styles.statLabel}>Registered accounts</span>
        <span className={styles.statValue}>{loading && stats.total === 0 ? "—" : stats.registered.toLocaleString()}</span>
      </div>
    </Card>

    <Card className={styles.statCard}>
      <span className={`${styles.statIcon} ${styles.guestIcon}`}><UserRound size={20} /></span>
      <div>
        <span className={styles.statLabel}>Guest customers</span>
        <span className={styles.statValue}>{loading && stats.total === 0 ? "—" : stats.guests.toLocaleString()}</span>
      </div>
    </Card>
  </div>
);

export default CustomersStats;
