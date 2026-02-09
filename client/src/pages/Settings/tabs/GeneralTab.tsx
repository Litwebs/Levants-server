import { Card, Button } from "@/components/common";
import { Save } from "lucide-react";
import styles from "../Settings.module.css";

const GeneralTab = ({
  companySettings,
  setCompanySettings,
  handleSaveGeneral,
}: any) => {
  return (
    <div className={styles.sectionsContainer}>
      <Card className={styles.settingsCard}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Business Details</h2>
        </div>

        <div className={styles.formFields}>
          {[
            ["Company Name", "name"],
            ["Email Address", "email"],
            ["Phone Number", "phone"],
            ["Address", "address"],
            ["Website", "website"],
          ].map(([label, key]) => (
            <div key={key} className={styles.formField}>
              <label className={styles.fieldLabel}>{label}</label>
              <input
                className={styles.fieldInput}
                value={companySettings[key]}
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
        <Button variant="primary" onClick={handleSaveGeneral}>
          <Save size={18} />
          Save Changes
        </Button>
      </div>
    </div>
  );
};

export default GeneralTab;
