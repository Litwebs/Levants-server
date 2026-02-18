import { Loader2 } from "lucide-react";
import styles from "./LoadingScreen.module.css";

export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div className={styles.backdrop} role="status" aria-live="polite">
      <Loader2 size={22} className={styles.spinner} />
      <div className={styles.label}>{label}</div>
    </div>
  );
}
