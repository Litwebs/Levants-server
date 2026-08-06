import { Card, Button } from "@/components/common";
import { ImagePlus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import styles from "../Settings.module.css";

const BUSINESS_LOGO_MAX_BYTES = 2 * 1024 * 1024;

const formatFileSize = (bytes?: number) => {
  if (!bytes) return "Unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

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
  const [logoError, setLogoError] = useState("");

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
          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Business Logo</label>
            <div className={styles.logoUploadPanel}>
              <div className={styles.logoPreview}>
                {companySettings.logo ? (
                  <img
                    src={companySettings.logo}
                    alt="Business logo preview"
                    onLoad={(event) => {
                      const width = event.currentTarget.naturalWidth;
                      const height = event.currentTarget.naturalHeight;
                      if (
                        !width ||
                        !height ||
                        (companySettings.logoMetadata?.width === width &&
                          companySettings.logoMetadata?.height === height)
                      ) {
                        return;
                      }
                      setCompanySettings({
                        ...companySettings,
                        logoMetadata: {
                          ...(companySettings.logoMetadata || {
                            originalName: "Business logo",
                            mimeType: "",
                            sizeBytes: 0,
                          }),
                          width,
                          height,
                        },
                      });
                    }}
                  />
                ) : (
                  <div className={styles.logoPlaceholder}>
                    <ImagePlus size={24} />
                    <span>No logo</span>
                  </div>
                )}
              </div>
              <div className={styles.logoUploadContent}>
                <div className={styles.logoUploadCopy}>
                  <strong>
                    {companySettings.logo
                      ? "Your current business logo"
                      : "Add your business logo"}
                  </strong>
                  <span>
                    Used across your customer website and outgoing emails. PNG,
                    JPG, WebP or SVG. Maximum file size: 2 MB.
                  </span>
                </div>
                {companySettings.logoMetadata ? (
                  <dl className={styles.logoMetadata}>
                    <div>
                      <dt>Type</dt>
                      <dd>
                        {companySettings.logoMetadata.mimeType || "Unknown"}
                      </dd>
                    </div>
                    <div>
                      <dt>Size</dt>
                      <dd>
                        {formatFileSize(companySettings.logoMetadata.sizeBytes)}
                      </dd>
                    </div>
                    <div>
                      <dt>Dimensions</dt>
                      <dd>
                        {companySettings.logoMetadata.width &&
                        companySettings.logoMetadata.height
                          ? `${companySettings.logoMetadata.width} × ${companySettings.logoMetadata.height} px`
                          : "Unknown"}
                      </dd>
                    </div>
                    {companySettings.logoMetadata.uploadedAt ? (
                      <div>
                        <dt>Uploaded</dt>
                        <dd>
                          {new Intl.DateTimeFormat("en-GB", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(
                            new Date(companySettings.logoMetadata.uploadedAt),
                          )}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
                {logoError ? (
                  <p className={styles.logoUploadError} role="alert">
                    {logoError}
                  </p>
                ) : null}
                <div className={styles.logoUploadActions}>
                  <label
                    className={`${styles.logoUploadButton} ${
                      disabled ? styles.logoUploadButtonDisabled : ""
                    }`}
                  >
                    <ImagePlus size={15} />
                    {companySettings.logo ? "Replace logo" : "Upload logo"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                      disabled={disabled}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (!file) return;
                        if (file.size > BUSINESS_LOGO_MAX_BYTES) {
                          setLogoError(
                            `"${file.name}" is ${formatFileSize(file.size)}. Please choose a logo that is 2 MB or smaller.`,
                          );
                          event.target.value = "";
                          return;
                        }
                        setLogoError("");
                        const reader = new FileReader();
                        reader.onload = () => {
                          const dataUrl = String(reader.result || "");
                          const image = new Image();
                          image.onload = () =>
                            setCompanySettings({
                              ...companySettings,
                              logo: dataUrl,
                              logoMetadata: {
                                originalName: file.name,
                                mimeType: file.type,
                                sizeBytes: file.size,
                                width: image.naturalWidth,
                                height: image.naturalHeight,
                              },
                            });
                          image.onerror = () =>
                            setLogoError(
                              "This image could not be read. Please choose another file.",
                            );
                          image.src = dataUrl;
                        };
                        reader.readAsDataURL(file);
                        event.target.value = "";
                      }}
                    />
                  </label>
                  {companySettings.logo ? (
                    <button
                      type="button"
                      className={styles.logoRemoveButton}
                      disabled={disabled}
                      onClick={() => {
                        setLogoError("");
                        setCompanySettings({
                          ...companySettings,
                          logo: "",
                          logoMetadata: null,
                        });
                      }}
                    >
                      <Trash2 size={15} />
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

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
              onFocus={(e) => e.currentTarget.select()}
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
