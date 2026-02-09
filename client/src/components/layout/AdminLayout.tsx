import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, ShoppingCart, Truck, Package, Users, 
  Tag, FileText, BarChart3, Settings, ChevronLeft, ChevronRight,
  Bell, Search, User, Moon, Sun, Menu
} from 'lucide-react';
import styles from './AdminLayout.module.css';

const navItems = [
  { path: '/', label: 'Overview', icon: LayoutDashboard },
  { path: '/orders', label: 'Orders', icon: ShoppingCart },
  { path: '/deliveries', label: 'Deliveries', icon: Truck },
  { path: '/delivery-runs', label: 'Delivery Runs', icon: Truck },
  { path: '/products', label: 'Products', icon: Package },
  { path: '/customers', label: 'Customers', icon: Users },
  { path: '/promotions', label: 'Promotions', icon: Tag },
  { path: '/content', label: 'Content', icon: FileText },
  { path: '/reports', label: 'Reports', icon: BarChart3 },
  { path: '/settings', label: 'Settings', icon: Settings },
];

interface AdminLayoutProps {
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const location = useLocation();

  return (
    <div className={styles.layout} data-theme={darkMode ? 'dark' : 'light'}>
      <aside className={`${styles.sidebar} ${collapsed ? styles.collapsed : ''}`}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>LD</div>
          {!collapsed && <span className={styles.logoText}>Levants Dairy</span>}
        </div>
        
        <nav className={styles.nav}>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={20} />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <button 
          className={styles.collapseBtn}
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </aside>

      <div className={styles.main}>
        <header className={styles.topbar}>
          <button className={styles.mobileMenu}>
            <Menu size={20} />
          </button>
          
          <div className={styles.searchBar}>
            <Search size={18} />
            <input type="text" placeholder="Search orders, products, customers..." />
          </div>

          <div className={styles.topbarActions}>
            <button className={styles.iconBtn} onClick={() => setDarkMode(!darkMode)}>
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button className={styles.iconBtn}>
              <Bell size={20} />
              <span className={styles.notificationDot} />
            </button>
            <div className={styles.userMenu}>
              <div className={styles.avatar}>JL</div>
              <div className={styles.userInfo}>
                <span className={styles.userName}>John Levant</span>
                <span className={styles.userRole}>Owner</span>
              </div>
            </div>
          </div>
        </header>

        <main className={styles.content}>
          {children}
        </main>
      </div>
    </div>
  );
};
