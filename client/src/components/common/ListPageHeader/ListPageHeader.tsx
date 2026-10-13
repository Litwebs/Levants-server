import { RefreshCw } from "lucide-react";
import { Button } from "../Button";
import styles from "./ListPageHeader.module.css";

export function ListPageHeader({ title, subtitle, loading, refresh }: {
  title: string;
  subtitle: string;
  loading: boolean;
  refresh: () => unknown;
}) {
  return <div className={styles.header}>
    <div><h1 className={styles.title}>{title}</h1><p className={styles.subtitle}>{subtitle}</p></div>
    <div className={styles.actions}>
      <Button variant="outline" leftIcon={<RefreshCw size={16} />} onClick={() => void refresh()} disabled={loading}>Refresh</Button>
    </div>
  </div>;
}
