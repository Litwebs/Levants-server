import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/common/Toast";
import { mockUsers, defaultNotificationSettings } from "./mockData";
import { useAuth } from "@/context/Auth/AuthContext";

type UserStatus = string;

export type User = {
  id: string;
  name: string;
  email: string;
  role?: object | string;
  status: UserStatus;
  lastLogin: string;
  createdAt: string;
};

type UserForm = {
  name: string;
  email: string;
  role?: string;
  status: UserStatus;
  password: string;
  confirmPassword: string;
};

type NotificationChannel = string;

export const useSettings = () => {
  const { showToast } = useToast();
  const { user, updateSelf, changePassword, toggle2FA } = useAuth();

  /* -------------------- TABS -------------------- */
  const SETTINGS_TAB_KEY = "levants.settings.activeTab";
  const [activeTab, _setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "general";
    return window.localStorage.getItem(SETTINGS_TAB_KEY) || "general";
  });

  const setActiveTab = (value: string) => {
    _setActiveTab(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SETTINGS_TAB_KEY, value);
    }
  };

  /* -------------------- GENERAL -------------------- */
  const [companySettings, setCompanySettings] = useState({
    name: "Levants Dairy Farm",
    email: "info@levantsdairy.com",
    phone: "+1 (555) 123-4567",
    address: "123 Farm Road, Countryside, State 12345",
    website: "www.levantsdairy.com",
    timezone: "America/New_York",
    currency: "USD",
    dateFormat: "MM/DD/YYYY",
    businessHours: "6:00 AM - 8:00 PM",
  });

  const handleSaveGeneral = () =>
    showToast({ type: "success", title: "General settings saved successfully" });

  /* -------------------- USERS -------------------- */
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userModalMode, setUserModalMode] = useState<"add" | "edit">("add");

  const emptyUserForm: UserForm = {
    name: "",
    email: "",
    role: "staff",
    status: "active",
    password: "",
    confirmPassword: "",
  };

  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);

  const openUserModal = (mode: "add" | "edit", user?: User) => {
    setUserModalMode(mode);

    if (mode === "edit" && user) {
      setSelectedUser(user);
      setUserForm({
        name: user.name,
        email: user.email,
        role:
          typeof user.role === "string"
            ? user.role
            : ((user.role as any)?.name as string | undefined),
        status: user.status,
        password: "",
        confirmPassword: "",
      });
    } else {
      setSelectedUser(null);
      setUserForm(emptyUserForm);
    }

    setIsUserModalOpen(true);
  };

  const saveUser = () => {
    if (!userForm.name.trim() || !userForm.email.trim()) {
      showToast({ type: "error", title: "Name and email are required" });
      return;
    }

    if (userModalMode === "add") {
      if (!userForm.password || userForm.password !== userForm.confirmPassword) {
        showToast({ type: "error", title: "Passwords do not match" });
        return;
      }

      const newUser: User = {
        id: `USR${String(users.length + 1).padStart(3, "0")}`,
        name: userForm.name,
        email: userForm.email,
        role: userForm.role,
        status: userForm.status,
        lastLogin: "Never",
        createdAt: new Date().toISOString().split("T")[0],
      };

      setUsers((prev) => [...prev, newUser]);
      showToast({ type: "success", title: "User created successfully" });
    }

    if (userModalMode === "edit" && selectedUser) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === selectedUser.id
            ? {
                ...u,
                name: userForm.name,
                email: userForm.email,
                role: userForm.role,
                status: userForm.status,
              }
            : u
        )
      );

      showToast({ type: "success", title: "User updated successfully" });
    }

    setIsUserModalOpen(false);
    setSelectedUser(null);
    setUserForm(emptyUserForm);
  };

  const deleteUser = (id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id));
    showToast({ type: "success", title: "User deleted successfully" });
  };

  const toggleUserStatus = (id: string) => {
    setUsers((prev) =>
      prev.map((u) =>
        u.id === id
          ? { ...u, status: u.status === "active" ? "inactive" : "active" }
          : u
      )
    );
    showToast({ type: "success", title: "User status updated" });
  };

  /* -------------------- NOTIFICATIONS -------------------- */
  const [notificationSettings, setNotificationSettings] = useState(
    defaultNotificationSettings
  );

  const toggleNotification = (id: string, channel: NotificationChannel) => {
    setNotificationSettings((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, [channel]: !n[channel] } : n
      )
    );
  };

  const saveNotifications = () =>
    showToast({ type: "success", title: "Notification preferences saved" });

  /* -------------------- SECURITY -------------------- */
  const currentUserId = user?.id ?? user?._id ?? null;
  const [lastInitializedUserId, setLastInitializedUserId] = useState<
    string | null
  >(null);
  const derivedAccountInfo = useMemo(() => {
    const name = user?.name ?? "";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const firstName = parts[0] ?? "";
    const lastName = parts.slice(1).join(" ");
    // const roleValue = typeof user?.role === "string" ? user.role : user?.role?.name ?? "";
    return {
      firstName,
      lastName,
      role: user?.role,
      phone: "",
    };
  }, [user?.name, user?.role]);

  const [accountInfo, setAccountInfo] = useState(() => derivedAccountInfo);

  const [emailSettings, setEmailSettings] = useState(() => ({
    currentEmail: user?.email ?? "",
    newEmail: "",
  }));

  const [passwordSettings, setPasswordSettings] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [twoFactorMethod, setTwoFactorMethod] = useState<string>("app");

  const [securityLoading, setSecurityLoading] = useState({
    savingAccountInfo: false,
    updatingEmail: false,
    changingPassword: false,
    toggling2FA: false,
  });

  useEffect(() => {
    if (!currentUserId) return;
    if (currentUserId === lastInitializedUserId) return;

    setLastInitializedUserId(currentUserId);
    setAccountInfo(derivedAccountInfo);
    setEmailSettings({
      currentEmail: user?.email ?? "",
      newEmail: "",
    });
  }, [currentUserId, derivedAccountInfo, lastInitializedUserId, user?.email]);

  const twoFactorEnabled = !!user?.twoFactorEnabled;

  const handleToggle2FA = async () => {
    if (securityLoading.toggling2FA) return;
    setSecurityLoading((prev) => ({ ...prev, toggling2FA: true }));
    try {
      const wasEnabled = !!user?.twoFactorEnabled;
      await toggle2FA();
      showToast({
        type: "success",
        title: wasEnabled
          ? "Two-factor authentication disabled"
          : "Two-factor authentication enabled",
      });
    } catch (err: any) {
      showToast({
        type: "error",
        title: err?.response?.data?.message || "Failed to update 2FA",
      });
    } finally {
      setSecurityLoading((prev) => ({ ...prev, toggling2FA: false }));
    }
  };

  const handleSaveAccountInfo = async () => {
    if (securityLoading.savingAccountInfo) return;
    setSecurityLoading((prev) => ({ ...prev, savingAccountInfo: true }));
    try {
      const nameToSave = `${accountInfo.firstName || ""} ${accountInfo.lastName || ""}`.trim();

      if (nameToSave.length < 2) {
        showToast({ type: "error", title: "Please enter a valid name" });
        return;
      }

      await updateSelf({ name: nameToSave });
      showToast({ type: "success", title: "Account information updated" });
    } catch (err: any) {
      showToast({
        type: "error",
        title: err?.response?.data?.message || "Failed to update account info",
      });
    } finally {
      setSecurityLoading((prev) => ({ ...prev, savingAccountInfo: false }));
    }
  };

  const handleUpdateEmail = async () => {
    if (!emailSettings.newEmail.trim()) {
      showToast({ type: "error", title: "Please enter a new email address" });
      return;
    }

    if (securityLoading.updatingEmail) return;
    setSecurityLoading((prev) => ({ ...prev, updatingEmail: true }));

    try {
      await updateSelf({ email: emailSettings.newEmail.trim() });
      setEmailSettings({
        currentEmail: emailSettings.newEmail.trim(),
        newEmail: "",
      });
      showToast({ type: "success", title: "Email updated successfully" });
    } catch (err: any) {
      showToast({
        type: "error",
        title: err?.response?.data?.message || "Failed to update email",
      });
    } finally {
      setSecurityLoading((prev) => ({ ...prev, updatingEmail: false }));
    }
  };

  const handleChangePassword = async () => {
    if (
      !passwordSettings.currentPassword ||
      !passwordSettings.newPassword ||
      !passwordSettings.confirmPassword
    ) {
      showToast({ type: "error", title: "Please fill all password fields" });
      return;
    }

    if (passwordSettings.newPassword !== passwordSettings.confirmPassword) {
      showToast({ type: "error", title: "New passwords do not match" });
      return;
    }

    if (securityLoading.changingPassword) return;
    setSecurityLoading((prev) => ({ ...prev, changingPassword: true }));

    try {
      await changePassword({
        currentPassword: passwordSettings.currentPassword,
        newPassword: passwordSettings.newPassword,
        confirmNewPassword: passwordSettings.confirmPassword,
      });

      setPasswordSettings({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });

      setShowCurrentPassword(false);
      setShowNewPassword(false);

      showToast({ type: "success", title: "Password changed successfully" });
    } catch (err: any) {
      showToast({
        type: "error",
        title: err?.response?.data?.message || "Failed to change password",
      });
    } finally {
      setSecurityLoading((prev) => ({ ...prev, changingPassword: false }));
    }
  };

  /* -------------------- EXPORT -------------------- */
  return {
    activeTab,
    setActiveTab,

    companySettings,
    setCompanySettings,
    handleSaveGeneral,

    users,
    selectedUser,
    userForm,
    setUserForm,
    userModalMode,
    isUserModalOpen,
    setIsUserModalOpen,

    handleOpenUserModal: openUserModal,
    saveUser,
    handleDeleteUser: deleteUser,
    handleToggleUserStatus: toggleUserStatus,

    notificationSettings,
    handleToggleNotification: toggleNotification,
    handleSaveNotifications: saveNotifications,

    accountInfo,
    setAccountInfo,
    emailSettings,
    setEmailSettings,
    passwordSettings,
    setPasswordSettings,
    showCurrentPassword,
    setShowCurrentPassword,
    showNewPassword,
    setShowNewPassword,

    twoFactorEnabled,
    twoFactorMethod,
    setTwoFactorMethod,
    handleToggle2FA,
    handleSaveAccountInfo,
    handleUpdateEmail,
    handleChangePassword,

    securityLoading,
  };
};
