import styles from "./Settings.module.css";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/common/Tabs";
import { Building2, Users, Bell, Shield, KeyRound, User } from "lucide-react";

import { useSettings } from "./useSettings";
import SettingsHeader from "./components/SettingsHeader";

import GeneralTab from "./tabs/GeneralTab";
import UsersTab from "./tabs/UsersTab";
import NotificationsTab from "./tabs/NotificationsTab";
import SecurityTab from "./tabs/SecurityTab";
import RolesTab from "./tabs/RolesTab";
import PreferencesTab from "./tabs/PreferencesTab";
import UserModal from "./UserModel";

const Settings = () => {
  const state = useSettings();

  const canShow = (tab: string) => state.allowedTabs?.includes(tab);
  return (
    <div className={styles.settings}>
      <SettingsHeader />

      <Tabs
        key={state.activeTab}
        defaultValue={state.activeTab}
        onChange={state.setActiveTab}
      >
        <TabsList className={styles.tabsList}>
          {canShow("preferences") && (
            <TabsTrigger value="preferences" className={styles.tabTrigger}>
              <User size={18} /> Preferences
            </TabsTrigger>
          )}
          {canShow("general") && (
            <TabsTrigger value="general" className={styles.tabTrigger}>
              <Building2 size={18} /> General
            </TabsTrigger>
          )}
          {canShow("users") && (
            <TabsTrigger value="users" className={styles.tabTrigger}>
              <Users size={18} /> Users
            </TabsTrigger>
          )}
          {canShow("roles") && (
            <TabsTrigger value="roles" className={styles.tabTrigger}>
              <KeyRound size={18} /> Roles
            </TabsTrigger>
          )}
          {canShow("notifications") && (
            <TabsTrigger value="notifications" className={styles.tabTrigger}>
              <Bell size={18} /> Notifications
            </TabsTrigger>
          )}
          {canShow("security") && (
            <TabsTrigger value="security" className={styles.tabTrigger}>
              <Shield size={18} /> Security
            </TabsTrigger>
          )}
        </TabsList>

        {canShow("general") && (
          <TabsContent value="general">
            <GeneralTab {...state} />
          </TabsContent>
        )}

        {canShow("preferences") && (
          <TabsContent value="preferences">
            <PreferencesTab
              themePreference={state.themePreference}
              setThemePreference={state.setThemePreference}
              handleSaveThemePreference={state.handleSaveThemePreference}
              preferencesLoading={state.preferencesLoading}
            />
          </TabsContent>
        )}

        {canShow("users") && (
          <TabsContent value="users">
            <UsersTab {...state} />
          </TabsContent>
        )}

        {canShow("notifications") && (
          <TabsContent value="notifications">
            <NotificationsTab {...state} />
          </TabsContent>
        )}

        {canShow("security") && (
          <TabsContent value="security">
            <SecurityTab {...state} />
          </TabsContent>
        )}

        {canShow("roles") && (
          <TabsContent value="roles">
            <RolesTab />
          </TabsContent>
        )}
      </Tabs>
      <UserModal
        isOpen={state.isUserModalOpen}
        onClose={() => state.setIsUserModalOpen(false)}
        mode={state.userModalMode}
        roles={state.roles}
        userForm={state.userForm}
        setUserForm={state.setUserForm}
        saveUser={state.saveUser}
      />
    </div>
  );
};

export default Settings;
