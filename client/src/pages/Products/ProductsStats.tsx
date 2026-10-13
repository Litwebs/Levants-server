import { Card } from "../../components/common";
import styles from "./Products.module.css";

const ProductsStats = ({ stats }: any) => {
  return (
    <div className={styles.statsGrid}>
      <Card className={styles.statCard}>
        <span className={styles.statLabel}>Total Products</span>
        <span className={styles.statValue}>{stats.total}</span>
      </Card>
      <Card className={styles.statCard}>
        <span className={styles.statLabel}>Active</span>
        <span className={`${styles.statValue} ${styles.success}`}>
          {stats.active}
        </span>
      </Card>
      <Card className={styles.statCard}>
        <span className={styles.statLabel}>Low Stock</span>
        <span className={`${styles.statValue} ${styles.warning}`}>
          {stats.lowStock}
        </span>
      </Card>
      <Card className={styles.statCard}>
        <span className={styles.statLabel}>Out of Stock</span>
        <span className={`${styles.statValue} ${styles.danger}`}>
          {stats.outOfStock}
        </span>
      </Card>
    </div>
  );
};

export default ProductsStats;
