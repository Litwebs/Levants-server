import { Calendar, DollarSign, Package } from "lucide-react";
import { Card } from "../../../components/common";
import { formatCompactNumber, formatCurrencyGBP } from "../../../lib/numberFormat";
import styles from "../Dashboard.module.css";

type StatCard = {
  label: string;
  value: React.ReactNode;
  icon: React.ElementType;
  color: "primary" | "success" | "warning" | "info" | "error";
  change?: string;
};

type Props = {
  summary: any;
  statCards: StatCard[];
};

const DashboardStats: React.FC<Props> = ({ summary, statCards }) => {
  const totalOrders = summary?.totalOrders ?? 0;

  return (
    <>
      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i} className={styles.statCard}>
              <div className={styles.statContent}>
                <div className={`${styles.statIcon} ${styles[stat.color]}`}>
                  <Icon size={20} />
                </div>
                <div className={styles.statInfo}>
                  <p className={styles.statLabel}>{stat.label}</p>
                  <div className={styles.statRow}>
                    <p className={styles.statValue}>{stat.value}</p>
                    {stat.change ? (
                      <span className={styles.statChange}>{stat.change}</span>
                    ) : null}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <Card className={styles.summaryCard}>
          <div className={styles.summaryContent}>
            <div className={`${styles.summaryIcon} ${styles.info}`}>
              <Calendar size={24} />
            </div>
            <div>
              <p className={styles.summaryValue}>
                {formatCompactNumber(totalOrders)}
              </p>
              <p className={styles.summaryLabel}>
                Total Orders (selected period)
              </p>
            </div>
          </div>
        </Card>

        <Card className={styles.summaryCard}>
          <div className={styles.summaryContent}>
            <div className={`${styles.summaryIcon} ${styles.success}`}>
              <DollarSign size={24} />
            </div>
            <div>
              <p className={styles.summaryValue}>
                {formatCurrencyGBP(summary?.revenue ?? 0)}
              </p>
              <p className={styles.summaryLabel}>Revenue (selected period)</p>
            </div>
          </div>
        </Card>

        <Card className={styles.summaryCard}>
          <div className={styles.summaryContent}>
            <div className={`${styles.summaryIcon} ${styles.warning}`}>
              <Package size={24} />
            </div>
            <div>
              <p className={styles.summaryValue}>
                {formatCompactNumber(summary?.lowStockItems ?? 0)}
              </p>
              <p className={styles.summaryLabel}>Low Stock Items</p>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
};

export default DashboardStats;
