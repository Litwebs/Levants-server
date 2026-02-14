import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Monitor, Moon, Save, Sun } from "lucide-react";
import styles from "../Settings.module.css";

type ThemePreference = "light" | "dark" | "system";

type Props = {
  themePreference: ThemePreference;
  setThemePreference: (next: ThemePreference) => void;
  handleSaveThemePreference: () => Promise<void> | void;
  preferencesLoading?: {
    savingTheme?: boolean;
  };
};

const PreferencesTab = ({
  themePreference,
  setThemePreference,
  handleSaveThemePreference,
  preferencesLoading,
}: Props) => {
  const saving = !!preferencesLoading?.savingTheme;

  return (
    <div className={styles.sectionsContainer}>
      <Card className={styles.settingsCard}>
        <div className={styles.cardHeader}>
          <div style={{ display: "flex", alignItems: "flex-start" }}>
            <div className={styles.cardHeaderIcon}>
              <Monitor size={20} />
            </div>
            <div>
              <h2 className={styles.cardTitle}>Preferences</h2>
              <p className={styles.cardDescription}>
                Choose how the dashboard theme should look.
              </p>
            </div>
          </div>
        </div>

        <div className={styles.formFields}>
          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Theme</label>
            <select
              className={styles.fieldSelect}
              value={themePreference}
              disabled={saving}
              onChange={(e) =>
                setThemePreference(e.target.value as ThemePreference)
              }
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
            <div
              style={{
                display: "flex",
                gap: "var(--space-3)",
                alignItems: "center",
                marginTop: "var(--space-2)",
                color: "var(--color-gray-600)",
                fontSize: "var(--text-sm)",
              }}
            >
              {themePreference === "light" ? (
                <>
                  <Sun size={16} /> Light theme
                </>
              ) : themePreference === "dark" ? (
                <>
                  <Moon size={16} /> Dark theme
                </>
              ) : (
                <>
                  <Monitor size={16} /> Follow system
                </>
              )}
            </div>
          </div>
        </div>

        <div className={styles.cardFooter}>
          <Button
            variant="primary"
            onClick={() => handleSaveThemePreference()}
            isLoading={saving}
          >
            <Save size={18} /> Save
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default PreferencesTab;
