import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/common/Toast";
import { useAuth } from "@/context/Auth/AuthContext";
import { useUsers } from "@/context/Users";
import api from "@/context/api";

type UserForm = {
  name: string;
  email: string;
  roleId: string;
  status: "active" | "disabled";
  password: string;
  confirmPassword: string;
};

type NotificationChannel = string;

type NotificationKey =
  | "newOrders"
  | "orderUpdates"
  | "lowStockAlerts"
  | "deliveryUpdates"
  | "customerMessages"
  | "paymentReceived";

type NotificationPrefs = Partial<Record<NotificationKey, boolean>>;

const NOTIFICATION_DEFINITIONS: Array<{
  key: NotificationKey;
  name: string;
  description: string;
}> = [
  {
    key: "newOrders",
    name: "New Orders",
    description: "Get notified when a new order is placed",
  },
  {
    key: "orderUpdates",
    name: "Order Updates",
    description: "Get notified when an order status changes",
  },
  {
    key: "lowStockAlerts",
    name: "Low Stock Alerts",
    description: "Get notified when inventory is running low",
  },
  {
    key: "deliveryUpdates",
    name: "Delivery Updates",
    description: "Get notified about delivery status updates",
  },
  {
    key: "customerMessages",
    name: "Customer Messages",
    description: "Get notified when customers send messages",
  },
  {
    key: "paymentReceived",
    name: "Payment Received",
    description: "Get notified when payments are received",
  },
];

export const useSettings = () => {
  const { showToast } = useToast();
  const { user, updateSelf, changePassword, toggle2FA } = useAuth();
  const {
    users: managedUsers,
    roles,
    fetchRoles,
    fetchUsers,
    getUserById,
    createUser,
    updateUser,
    updateUserStatus,
  } = useUsers();

  const currentUserId = user?.id ?? (user as any)?._id ?? null;

  const permissions: string[] = useMemo(() => {
    const role: any = (user as any)?.role;
    if (!role || typeof role !== "object") return [];
    const perms = role?.permissions;
    return Array.isArray(perms) ? perms : [];
  }, [user]);

  const hasPermission = useMemo(() => {
    return (perm: string) => permissions.includes("*") || permissions.includes(perm);
  }, [permissions]);

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

  const allowedTabs = useMemo(() => {
    // Tabs that are always available to authenticated users
    const base: Array<"notifications" | "security"> = ["notifications", "security"];

    // Business info requires permissions
    const canViewGeneral =
      hasPermission("business.info.read") || hasPermission("business.info.update");

    // User management requires permissions
    const canViewUsers =
      hasPermission("users.read") ||
      hasPermission("users.update") ||
      hasPermission("users.create") ||
      hasPermission("users.status.update");

    const tabs: string[] = [];
    if (canViewGeneral) tabs.push("general");
    if (canViewUsers) tabs.push("users");
    tabs.push(...base);
    return tabs;
  }, [hasPermission]);

  useEffect(() => {
    // If the persisted tab isn't allowed for the current user, fall back.
    if (!user) return;
    if (allowedTabs.length === 0) return;
    if (allowedTabs.includes(activeTab)) return;
    setActiveTab(allowedTabs[0]);
  }, [activeTab, allowedTabs, user]);

  /* -------------------- GENERAL -------------------- */
  type BusinessInfo = {
    companyName: string;
    email: string;
    phone: string;
    address: string;
  };

  const emptyBusinessInfo: BusinessInfo = {
    companyName: "",
    email: "",
    phone: "",
    address: "",
  };

  const [companySettings, setCompanySettings] = useState<BusinessInfo>(
    emptyBusinessInfo,
  );
  const [originalCompanySettings, setOriginalCompanySettings] =
    useState<BusinessInfo>(emptyBusinessInfo);
  const [generalLoading, setGeneralLoading] = useState({
    loading: false,
    saving: false,
  });

  const canReadBusinessInfo = useMemo(() => {
    return (
      hasPermission("business.info.read") || hasPermission("business.info.update")
    );
  }, [hasPermission]);

  const canUpdateBusinessInfo = useMemo(() => {
    return hasPermission("business.info.update");
  }, [hasPermission]);

  useEffect(() => {
    if (!user) return;
    if (!canReadBusinessInfo) return;

    setGeneralLoading((prev) => ({ ...prev, loading: true }));
    void api
      .get("/business-info")
      .then((res) => {
        const business = (res.data as any)?.data?.business;
        if (!business) return;
        const next: BusinessInfo = {
          companyName: business.companyName || "",
          email: business.email || "",
          phone: business.phone || "",
          address: business.address || "",
        };
        setCompanySettings(next);
        setOriginalCompanySettings(next);
      })
      .catch((err: any) => {
        showToast({
          type: "error",
          title:
            err?.response?.data?.message || "Failed to load business info",
        });
      })
      .finally(() => {
        setGeneralLoading((prev) => ({ ...prev, loading: false }));
      });
  }, [canReadBusinessInfo, showToast, user]);

  const handleSaveGeneral = async () => {
    if (!canUpdateBusinessInfo) {
      showToast({ type: "error", title: "You do not have access to update this" });
      return;
    }

    if (generalLoading.saving) return;

    const next: BusinessInfo = {
      companyName: companySettings.companyName,
      email: companySettings.email,
      phone: companySettings.phone,
      address: companySettings.address,
    };

    const unchanged =
      next.companyName === originalCompanySettings.companyName &&
      next.email === originalCompanySettings.email &&
      next.phone === originalCompanySettings.phone &&
      next.address === originalCompanySettings.address;

    if (unchanged) {
      showToast({ type: "success", title: "No changes to save" });
      return;
    }

    setGeneralLoading((prev) => ({ ...prev, saving: true }));
    try {
      await api.put("/business-info", next);
      setOriginalCompanySettings(next);
      showToast({ type: "success", title: "Business info updated" });
    } catch (err: any) {
      showToast({
        type: "error",
        title: err?.response?.data?.message || "Failed to update business info",
      });
    } finally {
      setGeneralLoading((prev) => ({ ...prev, saving: false }));
    }
  };

  /* -------------------- USERS -------------------- */
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userModalMode, setUserModalMode] = useState<"add" | "edit">("add");

  const emptyUserForm: UserForm = {
    name: "",
    email: "",
    roleId: "",
    status: "active",
    password: "",
    confirmPassword: "",
  };

  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);

  useEffect(() => {
    if (!user) return;

    const canViewUsers =
      hasPermission("users.read") ||
      hasPermission("users.update") ||
      hasPermission("users.create") ||
      hasPermission("users.status.update");

    if (canViewUsers) {
      void fetchUsers().catch(() => {
        // errors are handled by consumers via toasts
      });
    }

    const roleName =
      typeof (user as any)?.role === "object" ? (user as any)?.role?.name : null;
    const isAdmin = roleName === "admin";
    if (canViewUsers && isAdmin) {
      void fetchRoles().catch(() => {
        // errors are handled by consumers via toasts
      });
    }
  }, [fetchRoles, fetchUsers, hasPermission, user]);

  const openUserModal = async (mode: "add" | "edit", u?: any) => {
    setUserModalMode(mode);

    if (mode === "add") {
      setSelectedUserId(null);
      setUserForm(emptyUserForm);
      setIsUserModalOpen(true);
      return;
    }

    if (mode === "edit" && u) {
      const id = String(u?._id || u?.id || "");
      if (!id) return;

      setSelectedUserId(id);

      let userToEdit = u;
      try {
        userToEdit = await getUserById(id);
      } catch {
        // fall back to row data
      }

      setUserForm({
        name: userToEdit.name,
        email: userToEdit.email,
        roleId:
          typeof userToEdit.role === "object" && (userToEdit.role as any)?._id
            ? String((userToEdit.role as any)._id)
            : typeof userToEdit.role === "string" && userToEdit.role.length === 24
              ? userToEdit.role
            : "",
        status: userToEdit.status as "active" | "disabled",
        password: "",
        confirmPassword: "",
      });
    } else {
      setSelectedUserId(null);
      setUserForm(emptyUserForm);
    }

    setIsUserModalOpen(true);
  };

  const saveUser = async () => {
    if (!userForm.name.trim() || !userForm.email.trim()) {
      showToast({ type: "error", title: "Name and email are required" });
      return;
    }

    if (userModalMode === "add") {
      if (!userForm.roleId || userForm.roleId.length !== 24) {
        showToast({ type: "error", title: "Role is required" });
        return;
      }

      if (!userForm.password || userForm.password.length < 8) {
        showToast({ type: "error", title: "Password must be at least 8 characters" });
        return;
      }

      if (userForm.password !== userForm.confirmPassword) {
        showToast({ type: "error", title: "Passwords do not match" });
        return;
      }

      try {
        await createUser({
          name: userForm.name.trim(),
          email: userForm.email.trim(),
          password: userForm.password,
          roleId: userForm.roleId,
          status: userForm.status,
        });

        showToast({ type: "success", title: "User created successfully" });
      } catch (err: any) {
        showToast({
          type: "error",
          title: err?.response?.data?.message || "Failed to create user",
        });
        return;
      }
    }

    if (userModalMode === "edit" && selectedUserId) {
      try {
        const maybeRoleId = userForm.roleId && userForm.roleId.length === 24
          ? { roleId: userForm.roleId }
          : {};

        await updateUser(selectedUserId, {
          name: userForm.name.trim(),
          email: userForm.email.trim(),
          status: userForm.status,
          ...maybeRoleId,
        });

        showToast({ type: "success", title: "User updated successfully" });
      } catch (err: any) {
        showToast({
          type: "error",
          title: err?.response?.data?.message || "Failed to update user",
        });
        return;
      }
    }

    setIsUserModalOpen(false);
    setSelectedUserId(null);
    setUserForm(emptyUserForm);
  };

  const deleteUser = (_id: string) => {
    showToast({ type: "error", title: "Deleting users is not supported yet" });
  };

  const toggleUserStatus = (id: string) => {
    const target = managedUsers.find((u: any) => String(u?._id || u?.id) === id);
    if (!target) return;

    const nextStatus = target.status === "active" ? "disabled" : "active";
    void updateUserStatus(id, nextStatus)
      .then(() => {
        showToast({ type: "success", title: "User status updated" });
      })
      .catch((err: any) => {
        showToast({
          type: "error",
          title: err?.response?.data?.message || "Failed to update status",
        });
      });
  };

  /* -------------------- NOTIFICATIONS -------------------- */
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPrefs>(
    () => (user?.preferences?.notifications as NotificationPrefs) || {}
  );

  useEffect(() => {
    if (!currentUserId) return;
    setNotificationPrefs(
      (user?.preferences?.notifications as NotificationPrefs) || {}
    );
  }, [currentUserId, user?.preferences?.notifications]);

  const notificationSettings = useMemo(() => {
    return NOTIFICATION_DEFINITIONS.map((d) => ({
      id: d.key,
      name: d.name,
      description: d.description,
      email: !!notificationPrefs[d.key],
    }));
  }, [notificationPrefs]);

  const toggleNotification = (id: string, channel: NotificationChannel) => {
    if (channel !== "email") return;
    const key = id as NotificationKey;
    setNotificationPrefs((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const saveNotifications = async () => {
    try {
      await updateSelf({
        preferences: {
          notifications: notificationPrefs,
        },
      } as any);

      showToast({
        type: "success",
        title: "Notification preferences saved",
      });
    } catch (err: any) {
      showToast({
        type: "error",
        title:
          err?.response?.data?.message ||
          "Failed to save notification preferences",
      });
    }
  };

  /* -------------------- SECURITY -------------------- */
  const pendingEmail = user?.emailChange?.pendingEmail ?? null;
  const pendingEmailExpiresAt = user?.emailChange?.expiresAt ?? null;

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

      // Email does NOT change immediately (requires confirmation).
      // Keep current email as-is and clear the newEmail field.
      setEmailSettings((prev) => ({
        currentEmail: user?.email ?? prev.currentEmail,
        newEmail: "",
      }));

      showToast({
        type: "success",
        title: "Confirmation email sent. Please check your new inbox.",
      });
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
    permissions,
    hasPermission,
    allowedTabs,
    activeTab,
    setActiveTab,

    companySettings,
    setCompanySettings,
    handleSaveGeneral,
    generalLoading,

    users: managedUsers,
    roles,
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
    pendingEmail,
    pendingEmailExpiresAt,
    twoFactorMethod,
    setTwoFactorMethod,
    handleToggle2FA,
    handleSaveAccountInfo,
    handleUpdateEmail,
    handleChangePassword,

    securityLoading,
  };
};
