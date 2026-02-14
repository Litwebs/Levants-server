import { useEffect, useState } from "react";
import { Card } from "@/components/common/Card";
import { Button } from "@/components/common/Button";
import { Badge } from "@/components/common/Badge";
import {
  User,
  Mail,
  Lock,
  Smartphone,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Save,
} from "lucide-react";
import styles from "../Settings.module.css";

type AccountInfo = {
  firstName: string;
  lastName: string;
  role?: any;
  phone: string;
};

type EmailSettings = {
  currentEmail: string;
  newEmail: string;
};

type PasswordSettings = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type SecurityTabProps = {
  accountInfo: AccountInfo;
  setAccountInfo: React.Dispatch<React.SetStateAction<AccountInfo>>;
  emailSettings: EmailSettings;
  setEmailSettings: React.Dispatch<React.SetStateAction<EmailSettings>>;
  pendingEmail?: string | null;
  pendingEmailExpiresAt?: string | null;
  passwordSettings: PasswordSettings;
  setPasswordSettings: React.Dispatch<React.SetStateAction<PasswordSettings>>;
  showCurrentPassword: boolean;
  setShowCurrentPassword: React.Dispatch<React.SetStateAction<boolean>>;
  showNewPassword: boolean;
  setShowNewPassword: React.Dispatch<React.SetStateAction<boolean>>;
  twoFactorEnabled: boolean;
  handleToggle2FA: () => void;
  twoFactorMethod: string;
  setTwoFactorMethod: React.Dispatch<React.SetStateAction<string>>;
  handleSaveAccountInfo: () => void;
  handleUpdateEmail: () => void;
  handleChangePassword: () => void;

  securityLoading?: {
    savingAccountInfo?: boolean;
    updatingEmail?: boolean;
    changingPassword?: boolean;
    toggling2FA?: boolean;
  };
};

const SecurityTab = ({
  accountInfo,
  setAccountInfo,
  emailSettings,
  setEmailSettings,
  pendingEmail,
  pendingEmailExpiresAt,
  passwordSettings,
  setPasswordSettings,
  showCurrentPassword,
  setShowCurrentPassword,
  showNewPassword,
  setShowNewPassword,
  twoFactorEnabled,
  handleToggle2FA,
  twoFactorMethod,
  setTwoFactorMethod,
  handleSaveAccountInfo,
  handleUpdateEmail,
  handleChangePassword,
  securityLoading,
}: SecurityTabProps) => {
  if (!accountInfo || !emailSettings || !passwordSettings) return null;

  const [pendingTimeLeft, setPendingTimeLeft] = useState<string | null>(null);

  const formatTimeLeft = (ms: number) => {
    if (ms <= 0) return "expired";

    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;

    if (min < 60) return `${min}m ${sec}s`;

    const hr = Math.floor(min / 60);
    const remMin = min % 60;
    return `${hr}h ${remMin}m`;
  };

  useEffect(() => {
    if (!pendingEmail || !pendingEmailExpiresAt) {
      setPendingTimeLeft(null);
      return;
    }

    const tick = () => {
      const expires = new Date(pendingEmailExpiresAt).getTime();
      const now = Date.now();
      setPendingTimeLeft(formatTimeLeft(expires - now));
    };

    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [pendingEmail, pendingEmailExpiresAt]);

  const savingAccountInfo = !!securityLoading?.savingAccountInfo;
  const updatingEmail = !!securityLoading?.updatingEmail;
  const changingPassword = !!securityLoading?.changingPassword;
  const toggling2FA = !!securityLoading?.toggling2FA;

  return (
    <div className={styles.sectionsContainer}>
      {/* Account Information */}
      <Card className={styles.settingsCard}>
        <div className={styles.cardHeader}>
          <div className={styles.cardHeaderIcon}>
            <User size={20} />
          </div>
          <div>
            <h2 className={styles.cardTitle}>Account Information</h2>
            <p className={styles.cardDescription}>
              Update your personal details
            </p>
          </div>
        </div>

        <div className={styles.formFields}>
          <div className={styles.formFieldRow}>
            <div className={styles.formField}>
              <label className={styles.fieldLabel}>First Name</label>
              <input
                type="text"
                className={styles.fieldInput}
                value={accountInfo.firstName}
                disabled={savingAccountInfo}
                onChange={(e) =>
                  setAccountInfo({
                    ...accountInfo,
                    firstName: e.target.value,
                  })
                }
              />
            </div>

            <div className={styles.formField}>
              <label className={styles.fieldLabel}>Last Name</label>
              <input
                type="text"
                className={styles.fieldInput}
                value={accountInfo.lastName}
                disabled={savingAccountInfo}
                onChange={(e) =>
                  setAccountInfo({
                    ...accountInfo,
                    lastName: e.target.value,
                  })
                }
              />
            </div>
          </div>

          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Role</label>
            <input
              type="text"
              className={styles.fieldInput}
              disabled
              value={
                typeof accountInfo.role === "string"
                  ? accountInfo.role
                  : (accountInfo.role?.name ?? "")
              }
              onChange={(e) =>
                setAccountInfo({
                  ...accountInfo,
                  role: e.target.value,
                })
              }
            />
          </div>

          {/* <div className={styles.formField}>
            <label className={styles.fieldLabel}>Phone Number</label>
            <input
              type="tel"
              className={styles.fieldInput}
              value={accountInfo.phone}
              onChange={(e) =>
                setAccountInfo({
                  ...accountInfo,
                  phone: e.target.value,
                })
              }
            />
          </div> */}
        </div>

        <div className={styles.cardFooter}>
          <Button
            variant="primary"
            onClick={() => handleSaveAccountInfo()}
            isLoading={savingAccountInfo}
          >
            <Save size={18} />
            Save Changes
          </Button>
        </div>
      </Card>

      {/* Email Address */}
      <Card className={styles.settingsCard}>
        <div className={styles.cardHeader}>
          <div className={styles.cardHeaderIcon}>
            <Mail size={20} />
          </div>
          <div>
            <h2 className={styles.cardTitle}>Email Address</h2>
            <p className={styles.cardDescription}>Manage your email address</p>
          </div>
        </div>

        <div className={styles.formFields}>
          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Current Email</label>
            <input
              type="email"
              className={styles.fieldInput}
              value={emailSettings.currentEmail}
              disabled
            />
          </div>

          <div className={styles.formField}>
            <label className={styles.fieldLabel}>New Email Address</label>
            <input
              type="email"
              className={styles.fieldInput}
              value={emailSettings.newEmail}
              disabled={updatingEmail}
              onChange={(e) =>
                setEmailSettings({
                  ...emailSettings,
                  newEmail: e.target.value,
                })
              }
              placeholder="Enter new email address"
            />

            {pendingEmail && pendingTimeLeft && (
              <span className={styles.fieldHint}>
                Pending confirmation for {pendingEmail} —{" "}
                {pendingTimeLeft === "expired"
                  ? "link expired. Please re-save your email to resend."
                  : `expires in ${pendingTimeLeft}.`}
              </span>
            )}
          </div>
        </div>

        <div className={styles.cardFooter}>
          <Button
            variant="primary"
            onClick={() => handleUpdateEmail()}
            isLoading={updatingEmail}
          >
            <Save size={18} />
            Update Email
          </Button>
        </div>
      </Card>

      {/* Change Password */}
      <Card className={styles.settingsCard}>
        <div className={styles.cardHeader}>
          <div className={styles.cardHeaderIcon}>
            <Lock size={20} />
          </div>
          <div>
            <h2 className={styles.cardTitle}>Change Password</h2>
            <p className={styles.cardDescription}>
              Update your password regularly for security
            </p>
          </div>
        </div>

        <div className={styles.formFields}>
          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Current Password</label>
            <div className={styles.passwordInput}>
              <input
                type={showCurrentPassword ? "text" : "password"}
                className={styles.fieldInput}
                value={passwordSettings.currentPassword}
                disabled={changingPassword}
                onChange={(e) =>
                  setPasswordSettings({
                    ...passwordSettings,
                    currentPassword: e.target.value,
                  })
                }
              />
              <button
                type="button"
                className={styles.passwordToggle}
                disabled={changingPassword}
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
              >
                {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className={styles.formField}>
            <label className={styles.fieldLabel}>New Password</label>
            <div className={styles.passwordInput}>
              <input
                type={showNewPassword ? "text" : "password"}
                className={styles.fieldInput}
                value={passwordSettings.newPassword}
                disabled={changingPassword}
                onChange={(e) =>
                  setPasswordSettings({
                    ...passwordSettings,
                    newPassword: e.target.value,
                  })
                }
              />
              <button
                type="button"
                className={styles.passwordToggle}
                disabled={changingPassword}
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            <span className={styles.fieldHint}>
              Must be at least 8 characters
            </span>
          </div>

          <div className={styles.formField}>
            <label className={styles.fieldLabel}>Confirm New Password</label>
            <input
              type={showNewPassword ? "text" : "password"}
              className={styles.fieldInput}
              value={passwordSettings.confirmPassword}
              disabled={changingPassword}
              onChange={(e) =>
                setPasswordSettings({
                  ...passwordSettings,
                  confirmPassword: e.target.value,
                })
              }
            />
          </div>
        </div>

        <div className={styles.cardFooter}>
          <Button
            variant="primary"
            onClick={() => handleChangePassword()}
            isLoading={changingPassword}
          >
            <Lock size={18} />
            Change Password
          </Button>
        </div>
      </Card>

      {/* Two-Factor Authentication */}
      <Card className={styles.settingsCard}>
        <div className={styles.cardHeader}>
          <div className={styles.cardHeaderIcon}>
            <Smartphone size={20} />
          </div>
          <div>
            <h2 className={styles.cardTitle}>Two-Factor Authentication</h2>
            <p className={styles.cardDescription}>
              Add an extra layer of security to your account
            </p>
          </div>
        </div>

        <div className={styles.twoFactorContent}>
          <div className={styles.twoFactorStatus}>
            <div className={styles.twoFactorInfo}>
              <div className={styles.twoFactorBadge}>
                {twoFactorEnabled ? (
                  <Badge variant="success">
                    <CheckCircle2 size={14} />
                    Enabled
                  </Badge>
                ) : (
                  <Badge variant="default">
                    <XCircle size={14} />
                    Disabled
                  </Badge>
                )}
              </div>
              <p className={styles.twoFactorDesc}>
                {twoFactorEnabled
                  ? "Your account is protected with two-factor authentication."
                  : "Enable two-factor authentication for enhanced security."}
              </p>
            </div>

            <Button
              variant={twoFactorEnabled ? "danger" : "primary"}
              onClick={() => handleToggle2FA()}
              isLoading={toggling2FA}
            >
              {twoFactorEnabled ? "Disable 2FA" : "Enable 2FA"}
            </Button>
          </div>

          {twoFactorEnabled && (
            <div className={styles.twoFactorMethod}>
              <label className={styles.fieldLabel}>Verification Method</label>

              <div className={styles.methodOptions}>
                <label className={styles.methodOption}>
                  <input
                    type="radio"
                    checked
                    disabled={toggling2FA}
                    onChange={() => setTwoFactorMethod("email")}
                  />
                  <span className={styles.methodLabel}>
                    <strong>Email</strong>
                    <span>Receive verification codes via email</span>
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default SecurityTab;
