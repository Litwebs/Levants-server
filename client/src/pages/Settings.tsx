import { useState } from 'react';
import { 
  Settings as SettingsIcon, 
  Users, 
  Bell, 
  Shield, 
  Building2, 
  Mail, 
  Phone, 
  MapPin,
  Globe,
  Clock,
  Save,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  UserPlus,
  CheckCircle2,
  XCircle,
  User,
  Lock,
  Smartphone
} from 'lucide-react';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { Modal } from '@/components/common/Modal';
import { FormGrid, FormRow, FormSection } from '@/components/common/FormGrid';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/common/Tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/common/Table';
import { Badge } from '@/components/common/Badge';
import { useToast } from '@/components/common/Toast';
import styles from './Settings.module.css';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'staff' | 'driver';
  status: 'active' | 'inactive';
  lastLogin: string;
  createdAt: string;
}

interface NotificationSetting {
  id: string;
  name: string;
  description: string;
  email: boolean;
  push: boolean;
  sms: boolean;
}

const mockUsers: User[] = [
  { id: 'USR001', name: 'John Admin', email: 'john@levantsdairy.com', role: 'admin', status: 'active', lastLogin: '2025-01-31 14:30', createdAt: '2024-06-15' },
  { id: 'USR002', name: 'Sarah Manager', email: 'sarah@levantsdairy.com', role: 'manager', status: 'active', lastLogin: '2025-01-31 09:15', createdAt: '2024-07-20' },
  { id: 'USR003', name: 'Mike Staff', email: 'mike@levantsdairy.com', role: 'staff', status: 'active', lastLogin: '2025-01-30 16:45', createdAt: '2024-08-10' },
  { id: 'USR004', name: 'David Driver', email: 'david@levantsdairy.com', role: 'driver', status: 'active', lastLogin: '2025-01-31 06:00', createdAt: '2024-09-05' },
  { id: 'USR005', name: 'Emma Staff', email: 'emma@levantsdairy.com', role: 'staff', status: 'inactive', lastLogin: '2025-01-15 11:20', createdAt: '2024-10-12' },
];

const defaultNotificationSettings: NotificationSetting[] = [
  { id: 'notif-1', name: 'New Orders', description: 'Get notified when a new order is placed', email: true, push: true, sms: false },
  { id: 'notif-2', name: 'Order Updates', description: 'Updates on order status changes', email: true, push: true, sms: false },
  { id: 'notif-3', name: 'Low Stock Alerts', description: 'Alert when product stock is running low', email: true, push: true, sms: true },
  { id: 'notif-4', name: 'Delivery Updates', description: 'Track delivery progress and completions', email: false, push: true, sms: false },
  { id: 'notif-5', name: 'Customer Messages', description: 'New messages from customers', email: true, push: true, sms: false },
  { id: 'notif-6', name: 'Payment Received', description: 'Confirmation of successful payments', email: true, push: false, sms: false },
  { id: 'notif-7', name: 'Daily Reports', description: 'Daily summary of business activities', email: true, push: false, sms: false },
  { id: 'notif-8', name: 'Security Alerts', description: 'Login attempts and security notifications', email: true, push: true, sms: true },
];

const Settings = () => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState('general');
  
  // General Settings State
  const [companySettings, setCompanySettings] = useState({
    name: 'Levants Dairy Farm',
    email: 'info@levantsdairy.com',
    phone: '+1 (555) 123-4567',
    address: '123 Farm Road, Countryside, State 12345',
    website: 'www.levantsdairy.com',
    timezone: 'America/New_York',
    currency: 'USD',
    dateFormat: 'MM/DD/YYYY',
    businessHours: '6:00 AM - 8:00 PM'
  });
  
  // Users State
  const [users, setUsers] = useState<User[]>(mockUsers);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [userModalMode, setUserModalMode] = useState<'add' | 'edit'>('add');
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    role: 'staff' as User['role'],
    status: 'active' as User['status'],
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  
  // Notifications State
  const [notificationSettings, setNotificationSettings] = useState<NotificationSetting[]>(defaultNotificationSettings);
  
  // Security State - Account Info
  const [accountInfo, setAccountInfo] = useState({
    firstName: 'John',
    lastName: 'Admin',
    displayName: 'John Admin',
    phone: '+1 (555) 123-4567'
  });

  // Security State - Email
  const [emailSettings, setEmailSettings] = useState({
    currentEmail: 'john@levantsdairy.com',
    newEmail: ''
  });

  // Security State - Password
  const [passwordSettings, setPasswordSettings] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Security State - 2FA
  const [twoFactorEnabled, setTwoFactorEnabled] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<'app' | 'sms'>('app');

  const handleSaveGeneral = () => {
    showToast({ type: 'success', title: 'General settings saved successfully' });
  };

  const handleOpenUserModal = (mode: 'add' | 'edit', user?: User) => {
    setUserModalMode(mode);
    if (mode === 'edit' && user) {
      setSelectedUser(user);
      setUserForm({
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        password: '',
        confirmPassword: ''
      });
    } else {
      setSelectedUser(null);
      setUserForm({
        name: '',
        email: '',
        role: 'staff',
        status: 'active',
        password: '',
        confirmPassword: ''
      });
    }
    setIsUserModalOpen(true);
  };

  const handleSaveUser = () => {
    if (!userForm.name || !userForm.email) {
      showToast({ type: 'error', title: 'Please fill in all required fields' });
      return;
    }
    
    if (userModalMode === 'add' && (!userForm.password || userForm.password !== userForm.confirmPassword)) {
      showToast({ type: 'error', title: 'Passwords do not match' });
      return;
    }

    if (userModalMode === 'add') {
      const newUser: User = {
        id: `USR${String(users.length + 1).padStart(3, '0')}`,
        name: userForm.name,
        email: userForm.email,
        role: userForm.role,
        status: userForm.status,
        lastLogin: 'Never',
        createdAt: new Date().toISOString().split('T')[0]
      };
      setUsers([...users, newUser]);
      showToast({ type: 'success', title: 'User created successfully' });
    } else if (selectedUser) {
      setUsers(users.map(u => 
        u.id === selectedUser.id 
          ? { ...u, name: userForm.name, email: userForm.email, role: userForm.role, status: userForm.status }
          : u
      ));
      showToast({ type: 'success', title: 'User updated successfully' });
    }
    
    setIsUserModalOpen(false);
  };

  const handleDeleteUser = (userId: string) => {
    if (confirm('Are you sure you want to delete this user?')) {
      setUsers(users.filter(u => u.id !== userId));
      showToast({ type: 'success', title: 'User deleted successfully' });
    }
  };

  const handleToggleUserStatus = (userId: string) => {
    setUsers(users.map(u => 
      u.id === userId 
        ? { ...u, status: u.status === 'active' ? 'inactive' : 'active' }
        : u
    ));
    showToast({ type: 'success', title: 'User status updated' });
  };

  const handleToggleNotification = (id: string, channel: 'email' | 'push' | 'sms') => {
    setNotificationSettings(notificationSettings.map(n => 
      n.id === id ? { ...n, [channel]: !n[channel] } : n
    ));
  };

  const handleSaveNotifications = () => {
    showToast({ type: 'success', title: 'Notification preferences saved' });
  };

  const handleSaveAccountInfo = () => {
    showToast({ type: 'success', title: 'Account information updated' });
  };

  const handleUpdateEmail = () => {
    if (!emailSettings.newEmail) {
      showToast({ type: 'error', title: 'Please enter a new email address' });
      return;
    }
    setEmailSettings({ currentEmail: emailSettings.newEmail, newEmail: '' });
    showToast({ type: 'success', title: 'Email updated successfully' });
  };

  const handleChangePassword = () => {
    if (!passwordSettings.currentPassword || !passwordSettings.newPassword || !passwordSettings.confirmPassword) {
      showToast({ type: 'error', title: 'Please fill in all password fields' });
      return;
    }
    if (passwordSettings.newPassword !== passwordSettings.confirmPassword) {
      showToast({ type: 'error', title: 'New passwords do not match' });
      return;
    }
    if (passwordSettings.newPassword.length < 8) {
      showToast({ type: 'error', title: 'Password must be at least 8 characters' });
      return;
    }
    setPasswordSettings({ currentPassword: '', newPassword: '', confirmPassword: '' });
    showToast({ type: 'success', title: 'Password changed successfully' });
  };

  const handleToggle2FA = () => {
    setTwoFactorEnabled(!twoFactorEnabled);
    showToast({ 
      type: 'success', 
      title: twoFactorEnabled ? 'Two-factor authentication disabled' : 'Two-factor authentication enabled' 
    });
  };

  const getRoleBadge = (role: User['role']) => {
    const variants: Record<User['role'], 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline'> = {
      admin: 'error',
      manager: 'warning',
      staff: 'info',
      driver: 'success'
    };
    return <Badge variant={variants[role]}>{role.charAt(0).toUpperCase() + role.slice(1)}</Badge>;
  };

  return (
    <div className={styles.settings}>
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <SettingsIcon className={styles.headerIcon} />
          <div>
            <h1 className={styles.title}>Settings</h1>
            <p className={styles.subtitle}>Manage your system preferences and configurations</p>
          </div>
        </div>
      </div>

      <Tabs defaultValue={activeTab} onChange={setActiveTab}>
        <TabsList className={styles.tabsList}>
          <TabsTrigger value="general" className={styles.tabTrigger}>
            <Building2 size={18} />
            <span>General</span>
          </TabsTrigger>
          <TabsTrigger value="users" className={styles.tabTrigger}>
            <Users size={18} />
            <span>Users</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className={styles.tabTrigger}>
            <Bell size={18} />
            <span>Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="security" className={styles.tabTrigger}>
            <Shield size={18} />
            <span>Security</span>
          </TabsTrigger>
        </TabsList>

        {/* General Settings Tab */}
        <TabsContent value="general" className={styles.tabContent}>
          <div className={styles.sectionsContainer}>
            <Card className={styles.settingsCard}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Business Details</h2>
                <p className={styles.cardDescription}>Basic information about your company</p>
              </div>
              
              <div className={styles.formFields}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Company Name</label>
                  <input
                    type="text"
                    className={styles.fieldInput}
                    value={companySettings.name}
                    onChange={(e) => setCompanySettings({ ...companySettings, name: e.target.value })}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Email Address</label>
                  <div className={styles.inputWithIcon}>
                    <Mail size={18} />
                    <input
                      type="email"
                      className={styles.fieldInput}
                      value={companySettings.email}
                      onChange={(e) => setCompanySettings({ ...companySettings, email: e.target.value })}
                    />
                  </div>
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Phone Number</label>
                  <div className={styles.inputWithIcon}>
                    <Phone size={18} />
                    <input
                      type="tel"
                      className={styles.fieldInput}
                      value={companySettings.phone}
                      onChange={(e) => setCompanySettings({ ...companySettings, phone: e.target.value })}
                    />
                  </div>
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Address</label>
                  <div className={styles.inputWithIcon}>
                    <MapPin size={18} />
                    <input
                      type="text"
                      className={styles.fieldInput}
                      value={companySettings.address}
                      onChange={(e) => setCompanySettings({ ...companySettings, address: e.target.value })}
                    />
                  </div>
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Website</label>
                  <div className={styles.inputWithIcon}>
                    <Globe size={18} />
                    <input
                      type="text"
                      className={styles.fieldInput}
                      value={companySettings.website}
                      onChange={(e) => setCompanySettings({ ...companySettings, website: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </Card>

            <Card className={styles.settingsCard}>
              <div className={styles.cardHeader}>
                <h2 className={styles.cardTitle}>Regional Settings</h2>
                <p className={styles.cardDescription}>Configure timezone, currency and date formats</p>
              </div>
              
              <div className={styles.formFields}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Timezone</label>
                  <select
                    className={styles.fieldSelect}
                    value={companySettings.timezone}
                    onChange={(e) => setCompanySettings({ ...companySettings, timezone: e.target.value })}
                  >
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="Europe/London">London (GMT)</option>
                    <option value="Europe/Paris">Paris (CET)</option>
                  </select>
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Currency</label>
                  <select
                    className={styles.fieldSelect}
                    value={companySettings.currency}
                    onChange={(e) => setCompanySettings({ ...companySettings, currency: e.target.value })}
                  >
                    <option value="USD">USD - US Dollar</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="GBP">GBP - British Pound</option>
                    <option value="CAD">CAD - Canadian Dollar</option>
                  </select>
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Date Format</label>
                  <select
                    className={styles.fieldSelect}
                    value={companySettings.dateFormat}
                    onChange={(e) => setCompanySettings({ ...companySettings, dateFormat: e.target.value })}
                  >
                    <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                    <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                    <option value="YYYY-MM-DD">YYYY-MM-DD</option>
                  </select>
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Business Hours</label>
                  <div className={styles.inputWithIcon}>
                    <Clock size={18} />
                    <input
                      type="text"
                      className={styles.fieldInput}
                      value={companySettings.businessHours}
                      onChange={(e) => setCompanySettings({ ...companySettings, businessHours: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </Card>

            <div className={styles.saveButtonRow}>
              <Button variant="primary" onClick={handleSaveGeneral}>
                <Save size={18} />
                Save Changes
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* Users Tab */}
        <TabsContent value="users" className={styles.tabContent}>
          <Card className={styles.settingsCard}>
            <div className={styles.cardHeader}>
              <div>
                <h2 className={styles.cardTitle}>User Management</h2>
                <p className={styles.cardDescription}>Manage team members and their access levels</p>
              </div>
              <Button variant="primary" onClick={() => handleOpenUserModal('add')}>
                <UserPlus size={18} />
                Add User
              </Button>
            </div>

            <div className={styles.tableWrapper}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map(user => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className={styles.userCell}>
                          <div className={styles.userAvatar}>
                            {user.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <div className={styles.userName}>{user.name}</div>
                            <div className={styles.userEmail}>{user.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
                      <TableCell>
                        <Badge variant={user.status === 'active' ? 'success' : 'default'}>
                          {user.status === 'active' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                          {user.status.charAt(0).toUpperCase() + user.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>{user.lastLogin}</TableCell>
                      <TableCell>{user.createdAt}</TableCell>
                      <TableCell>
                        <div className={styles.actions}>
                          <button 
                            className={styles.actionBtn}
                            onClick={() => handleOpenUserModal('edit', user)}
                            title="Edit user"
                          >
                            <Pencil size={16} />
                          </button>
                          <button 
                            className={styles.actionBtn}
                            onClick={() => handleToggleUserStatus(user.id)}
                            title={user.status === 'active' ? 'Deactivate' : 'Activate'}
                          >
                            {user.status === 'active' ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                          <button 
                            className={`${styles.actionBtn} ${styles.deleteBtn}`}
                            onClick={() => handleDeleteUser(user.id)}
                            title="Delete user"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className={styles.tabContent}>
          <Card className={styles.settingsCard}>
            <div className={styles.cardHeader}>
              <h2 className={styles.cardTitle}>Notification Preferences</h2>
              <p className={styles.cardDescription}>Choose how you want to be notified</p>
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
              
              {notificationSettings.map(setting => (
                <div key={setting.id} className={styles.notificationRow}>
                  <div className={styles.notificationInfo}>
                    <div className={styles.notificationName}>{setting.name}</div>
                    <div className={styles.notificationDesc}>{setting.description}</div>
                  </div>
                  <div className={styles.notificationToggles}>
                    <label className={styles.toggle}>
                      <input
                        type="checkbox"
                        checked={setting.email}
                        onChange={() => handleToggleNotification(setting.id, 'email')}
                      />
                      <span className={styles.toggleSlider}></span>
                    </label>
                    <label className={styles.toggle}>
                      <input
                        type="checkbox"
                        checked={setting.push}
                        onChange={() => handleToggleNotification(setting.id, 'push')}
                      />
                      <span className={styles.toggleSlider}></span>
                    </label>
                    <label className={styles.toggle}>
                      <input
                        type="checkbox"
                        checked={setting.sms}
                        onChange={() => handleToggleNotification(setting.id, 'sms')}
                      />
                      <span className={styles.toggleSlider}></span>
                    </label>
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
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className={styles.tabContent}>
          <div className={styles.sectionsContainer}>
            {/* Account Information */}
            <Card className={styles.settingsCard}>
              <div className={styles.cardHeader}>
                <div className={styles.cardHeaderIcon}>
                  <User size={20} />
                </div>
                <div>
                  <h2 className={styles.cardTitle}>Account Information</h2>
                  <p className={styles.cardDescription}>Update your personal details</p>
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
                      onChange={(e) => setAccountInfo({ ...accountInfo, firstName: e.target.value })}
                    />
                  </div>
                  <div className={styles.formField}>
                    <label className={styles.fieldLabel}>Last Name</label>
                    <input
                      type="text"
                      className={styles.fieldInput}
                      value={accountInfo.lastName}
                      onChange={(e) => setAccountInfo({ ...accountInfo, lastName: e.target.value })}
                    />
                  </div>
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Display Name</label>
                  <input
                    type="text"
                    className={styles.fieldInput}
                    value={accountInfo.displayName}
                    onChange={(e) => setAccountInfo({ ...accountInfo, displayName: e.target.value })}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Phone Number</label>
                  <input
                    type="tel"
                    className={styles.fieldInput}
                    value={accountInfo.phone}
                    onChange={(e) => setAccountInfo({ ...accountInfo, phone: e.target.value })}
                  />
                </div>
              </div>

              <div className={styles.cardFooter}>
                <Button variant="primary" onClick={handleSaveAccountInfo}>
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
                    onChange={(e) => setEmailSettings({ ...emailSettings, newEmail: e.target.value })}
                    placeholder="Enter new email address"
                  />
                </div>
              </div>

              <div className={styles.cardFooter}>
                <Button variant="primary" onClick={handleUpdateEmail}>
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
                  <p className={styles.cardDescription}>Update your password regularly for security</p>
                </div>
              </div>
              
              <div className={styles.formFields}>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Current Password</label>
                  <div className={styles.passwordInput}>
                    <input
                      type={showCurrentPassword ? 'text' : 'password'}
                      className={styles.fieldInput}
                      value={passwordSettings.currentPassword}
                      onChange={(e) => setPasswordSettings({ ...passwordSettings, currentPassword: e.target.value })}
                      placeholder="Enter current password"
                    />
                    <button 
                      type="button"
                      className={styles.passwordToggle}
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
                      type={showNewPassword ? 'text' : 'password'}
                      className={styles.fieldInput}
                      value={passwordSettings.newPassword}
                      onChange={(e) => setPasswordSettings({ ...passwordSettings, newPassword: e.target.value })}
                      placeholder="Enter new password"
                    />
                    <button 
                      type="button"
                      className={styles.passwordToggle}
                      onClick={() => setShowNewPassword(!showNewPassword)}
                    >
                      {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <span className={styles.fieldHint}>Must be at least 8 characters</span>
                </div>
                <div className={styles.formField}>
                  <label className={styles.fieldLabel}>Confirm New Password</label>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    className={styles.fieldInput}
                    value={passwordSettings.confirmPassword}
                    onChange={(e) => setPasswordSettings({ ...passwordSettings, confirmPassword: e.target.value })}
                    placeholder="Confirm new password"
                  />
                </div>
              </div>

              <div className={styles.cardFooter}>
                <Button variant="primary" onClick={handleChangePassword}>
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
                  <p className={styles.cardDescription}>Add an extra layer of security to your account</p>
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
                        ? 'Your account is protected with two-factor authentication.' 
                        : 'Enable two-factor authentication for enhanced security.'}
                    </p>
                  </div>
                  <Button 
                    variant={twoFactorEnabled ? 'secondary' : 'primary'} 
                    onClick={handleToggle2FA}
                  >
                    {twoFactorEnabled ? 'Disable 2FA' : 'Enable 2FA'}
                  </Button>
                </div>

                {twoFactorEnabled && (
                  <div className={styles.twoFactorMethod}>
                    <label className={styles.fieldLabel}>Verification Method</label>
                    <div className={styles.methodOptions}>
                      <label className={styles.methodOption}>
                        <input
                          type="radio"
                          name="twoFactorMethod"
                          value="app"
                          checked={twoFactorMethod === 'app'}
                          onChange={() => setTwoFactorMethod('app')}
                        />
                        <span className={styles.methodLabel}>
                          <strong>Authenticator App</strong>
                          <span>Use an app like Google Authenticator or Authy</span>
                        </span>
                      </label>
                      <label className={styles.methodOption}>
                        <input
                          type="radio"
                          name="twoFactorMethod"
                          value="sms"
                          checked={twoFactorMethod === 'sms'}
                          onChange={() => setTwoFactorMethod('sms')}
                        />
                        <span className={styles.methodLabel}>
                          <strong>SMS</strong>
                          <span>Receive codes via text message</span>
                        </span>
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* User Modal */}
      <Modal
        isOpen={isUserModalOpen}
        onClose={() => setIsUserModalOpen(false)}
        title={userModalMode === 'add' ? 'Add New User' : 'Edit User'}
        size="md"
      >
        <FormGrid>
          <FormRow label="Full Name *">
            <input
              type="text"
              value={userForm.name}
              onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
              placeholder="Enter full name"
            />
          </FormRow>
          <FormRow label="Email *">
            <input
              type="email"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              placeholder="Enter email address"
            />
          </FormRow>
          <FormRow label="Role">
            <select
              value={userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value as User['role'] })}
            >
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
              <option value="driver">Driver</option>
            </select>
          </FormRow>
          <FormRow label="Status">
            <select
              value={userForm.status}
              onChange={(e) => setUserForm({ ...userForm, status: e.target.value as User['status'] })}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </FormRow>
          {userModalMode === 'add' && (
            <>
              <FormRow label="Password *">
                <div className={styles.passwordInput}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    placeholder="Enter password"
                  />
                  <button 
                    type="button"
                    className={styles.passwordToggle}
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </FormRow>
              <FormRow label="Confirm Password *">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={userForm.confirmPassword}
                  onChange={(e) => setUserForm({ ...userForm, confirmPassword: e.target.value })}
                  placeholder="Confirm password"
                />
              </FormRow>
            </>
          )}
        </FormGrid>
        <div className={styles.modalFooter}>
          <Button variant="secondary" onClick={() => setIsUserModalOpen(false)}>Cancel</Button>
          <Button variant="primary" onClick={handleSaveUser}>
            {userModalMode === 'add' ? 'Create User' : 'Save Changes'}
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default Settings;
