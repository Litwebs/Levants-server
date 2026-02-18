import { Card, Button } from "@/components/common";
import { Save } from "lucide-react";
import styles from "../Settings.module.css";

const GeneralTab = ({
  companySettings,
  setCompanySettings,
  handleSaveGeneral,
  hasPermission,
  generalLoading,
}: any) => {
  const canUpdate = !!hasPermission?.("business.info.update");
  const isLoading = !!generalLoading?.loading;
  const isSaving = !!generalLoading?.saving;
  const disabled = !canUpdate || isLoading || isSaving;

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
      </Card>

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
    </div>
  );
};

export default GeneralTab;
