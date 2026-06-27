import { Card, Button } from "@/components/common";
import { Save } from "lucide-react";
import styles from "../Settings.module.css";

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
];

const GeneralTab = ({
  companySettings,
  setCompanySettings,
  handleSaveGeneral,
  hasPermission,
  generalLoading,
  subscriptionSettings,
  setSubscriptionSettings,
  toggleDeliveryDay,
  handleSaveSubscriptionSettings,
  subscriptionSettingsLoading,
}: any) => {
  const canUpdate = !!hasPermission?.("business.info.update");
  const isLoading = !!generalLoading?.loading;
  const isSaving = !!generalLoading?.saving;
  const disabled = !canUpdate || isLoading || isSaving;

  const subLoading = !!subscriptionSettingsLoading?.loading;
  const subSaving = !!subscriptionSettingsLoading?.saving;
  const subDisabled = !canUpdate || subLoading || subSaving;

  return (
    <div className={styles.sectionsContainer}>
      <Card className={styles.settingsCard}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Business Details</h2>
            <p className={styles.cardDescription}>
              {isLoading
                ? "Loading business info…"
                : "Update your business information"}
            </p>
          </div>
        </div>

        <div className={styles.formFields}>
          {[
            ["Company Name", "companyName"],
            ["Email Address", "email"],
            ["Phone Number", "phone"],
            ["Address", "address"],
          ].map(([label, key]) => (
            <div key={key} className={styles.formField}>
              <label className={styles.fieldLabel}>{label}</label>
              <input
                className={styles.fieldInput}
                value={companySettings[key] || ""}
                disabled={disabled}
                onChange={(e) =>
                  setCompanySettings({
                    ...companySettings,
                    [key]: e.target.value,
                  })
                }
              />
            </div>
          ))}
        </div>

        <div className={styles.saveButtonRow}>
          <Button
            variant="primary"
            onClick={handleSaveGeneral}
            disabled={disabled}
            isLoading={isLoading || isSaving}
          >
            <Save size={18} />
            {isSaving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </Card>

      <Card className={styles.settingsCard}>
        <div className={styles.cardHeader}>
          <div>
            <h2 className={styles.cardTitle}>Subscription Deliveries</h2>
            <p className={styles.cardDescription}>
              {subLoading
                ? "Loading subscription settings…"
                : "Set which days you deliver and the cut-off for subscription changes"}
            </p>
          </div>
        </div>

        <div className={styles.formFields}>
          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Delivery Days</label>
            <div className={styles.dayChips}>
              {WEEKDAYS.map((day) => {
                const active = (
                  subscriptionSettings?.deliveryDays || []
                ).includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    className={`${styles.dayChip} ${
                      active ? styles.dayChipActive : ""
                    }`}
                    disabled={subDisabled}
                    onClick={() => toggleDeliveryDay(day.value)}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
            <span className={styles.fieldHint}>
              Customers can only choose from the days selected here.
            </span>
          </div>

          <div className={styles.formField}>
            <label className={styles.fieldLabel}>
              Cut-off (days before delivery)
            </label>
            <input
              type="number"
              min={0}
              max={7}
              className={styles.fieldInput}
              value={subscriptionSettings?.cutoffDaysBefore ?? 0}
              disabled={subDisabled}
              onChange={(e) =>
                setSubscriptionSettings({
                  ...subscriptionSettings,
                  cutoffDaysBefore: Math.max(
                    0,
                    Math.min(7, Number(e.target.value) || 0),
                  ),
                })
              }
            />
            <span className={styles.fieldHint}>
              How many days before a delivery the changes are locked.
            </span>
          </div>

          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Cut-off Time</label>
            <input
              type="time"
              className={styles.fieldInput}
              value={subscriptionSettings?.cutoffTime || "22:00"}
              disabled={subDisabled}
              onChange={(e) =>
                setSubscriptionSettings({
                  ...subscriptionSettings,
                  cutoffTime: e.target.value,
                })
              }
            />
            <span className={styles.fieldHint}>
              Changes after this time on the cut-off day apply to the next
              delivery.
            </span>
          </div>
        </div>

        <div className={styles.saveButtonRow}>
          <Button
            variant="primary"
            onClick={handleSaveSubscriptionSettings}
            disabled={subDisabled}
            isLoading={subLoading || subSaving}
          >
            <Save size={18} />
            {subSaving ? "Saving…" : "Save Changes"}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default GeneralTab;
