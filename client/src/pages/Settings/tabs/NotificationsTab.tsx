import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Save } from "lucide-react";
import styles from "../Settings.module.css";

const NotificationsTab = ({
  notificationSettings,
  handleToggleNotification,
  handleSaveNotifications,
}: any) => {
  return (
    <Card className={styles.settingsCard}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>Notification Preferences</h2>
        <p className={styles.cardDescription}>
          Choose how you want to be notified
        </p>
      </div>

      <div className={styles.notificationGrid}>
        <div className={styles.notificationHeader}>
          <span className={styles.notificationName}>Notification Type</span>
          <div className={styles.notificationChannels}>
            <span>Email</span>
            <span>Push</span>
            <span>SMS</span>
          </div>
        </div>

        {notificationSettings.map((setting: any) => (
          <div key={setting.id} className={styles.notificationRow}>
            <div className={styles.notificationInfo}>
              <div className={styles.notificationName}>{setting.name}</div>
              <div className={styles.notificationDesc}>
                {setting.description}
              </div>
            </div>

            <div className={styles.notificationToggles}>
              {(["email", "push", "sms"] as const).map((channel) => (
                <label key={channel} className={styles.toggle}>
                  <input
                    type="checkbox"
                    checked={setting[channel]}
                    onChange={() =>
                      handleToggleNotification(setting.id, channel)
                    }
                  />
                  <span className={styles.toggleSlider}></span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={styles.cardFooter}>
        <Button variant="primary" onClick={handleSaveNotifications}>
          <Save size={18} />
          Save Preferences
        </Button>
      </div>
    </Card>
  );
};

export default NotificationsTab;
