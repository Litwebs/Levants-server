import { Settings as SettingsIcon } from "lucide-react";
import styles from "../Settings.module.css";

const SettingsHeader = () => {
  return (
    <div className={styles.header}>
      <div className={styles.headerContent}>
        <SettingsIcon className={styles.headerIcon} />
        <div>
          <h1 className={styles.title}>Settings</h1>
          <p className={styles.subtitle}>
            Manage your system preferences and configurations
          </p>
        </div>
      </div>
    </div>
  );
};

export default SettingsHeader;
