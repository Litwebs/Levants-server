import { Card } from "../../components/common";
import { Boxes, CircleCheck, CircleAlert, CircleX } from "lucide-react";
import styles from "./Products.module.css";

const ProductsStats = ({ stats }: any) => {
  const items = [
    {
      label: "Total products",
      description: "Catalogue size",
      value: stats.total,
      icon: <Boxes size={19} />,
      tone: "",
    },
    {
      label: "Active",
      description: "Available for sale",
      value: stats.active,
      icon: <CircleCheck size={19} />,
      tone: styles.successIcon,
    },
    {
      label: "Low stock",
      description: "Needs attention",
      value: stats.lowStock,
      icon: <CircleAlert size={19} />,
      tone: styles.warningIcon,
    },
    {
      label: "Out of stock",
      description: "Currently unavailable",
      value: stats.outOfStock,
      icon: <CircleX size={19} />,
      tone: styles.dangerIcon,
    },
  ];

  return (
    <Card padding="none" className={styles.catalogStats}>
      <dl className={styles.catalogStatsList} aria-label="Catalogue overview">
        {items.map((item) => (
          <div className={styles.catalogStatItem} key={item.label}>
            <span
              className={`${styles.statIcon} ${item.tone}`}
              aria-hidden="true"
            >
              {item.icon}
            </span>
            <div className={styles.statContent}>
              <dt className={styles.statLabel}>{item.label}</dt>
              <dd className={styles.statDetail}>
                <span className={styles.statValue}>{item.value}</span>
                <span className={styles.statDescription}>
                  {item.description}
                </span>
              </dd>
            </div>
          </div>
        ))}
      </dl>
    </Card>
  );
};

export default ProductsStats;
