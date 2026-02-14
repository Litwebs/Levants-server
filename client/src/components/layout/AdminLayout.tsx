import React, { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Truck,
  Package,
  Users,
  Tag,
  FileText,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  Moon,
  Sun,
  Menu,
} from "lucide-react";
import { LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/Auth/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import styles from "./AdminLayout.module.css";

const navItems = [
  {
    path: "/",
    label: "Overview",
    icon: LayoutDashboard,
    requiredAny: ["analytics.read"],
  },
  {
    path: "/deliveries",
    label: "Deliveries",
    icon: Truck,
    requiredAny: ["delivery.routes.read"],
  },
  {
    path: "/delivery-runs",
    label: "Delivery Runs",
    icon: Truck,
    requiredAny: ["delivery.routes.read"],
  },
  {
    path: "/orders",
    label: "Orders",
    icon: ShoppingCart,
    requiredAny: ["orders.read"],
  },
  {
    path: "/products",
    label: "Products",
    icon: Package,
    requiredAny: ["products.read"],
  },
  {
    path: "/customers",
    label: "Customers",
    icon: Users,
    requiredAny: ["customers.read"],
  },
  {
    path: "/discounts",
    label: "Discounts",
    icon: Tag,
    requiredAny: ["promotions.read"],
  },
  {
    path: "/settings",
    label: "Settings",
    icon: Settings,
  },
  // { path: '/promotions', label: 'Promotions', icon: Tag },
  // { path: '/content', label: 'Content', icon: FileText },
  // { path: '/reports', label: 'Reports', icon: BarChart3 },
];

interface AdminLayoutProps {
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const [systemPrefersDark, setSystemPrefersDark] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout, updateSelf } = useAuth();
  const { hasAnyPermission } = usePermissions();

  const themePreference =
    (user as any)?.preferences?.theme === "light" ||
    (user as any)?.preferences?.theme === "dark" ||
    (user as any)?.preferences?.theme === "system"
      ? ((user as any).preferences.theme as "light" | "dark" | "system")
      : "system";

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => setSystemPrefersDark(!!media.matches);
    apply();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", apply);
      return () => media.removeEventListener("change", apply);
    }

    // Safari fallback
    media.addListener(apply);
    return () => media.removeListener(apply);
  }, []);

  const resolvedTheme =
    themePreference === "system"
      ? systemPrefersDark
        ? "dark"
        : "light"
      : themePreference;

  const isDark = resolvedTheme === "dark";

  const roleLabel =
    typeof user?.role === "string" ? user.role : user?.role?.name;

  const visibleNavItems = navItems.filter((item) => {
    const requiredAny = (item as any).requiredAny as string[] | undefined;
    if (!Array.isArray(requiredAny) || requiredAny.length === 0) return true;
    return hasAnyPermission(requiredAny);
  });

  useEffect(() => {
    const theme = isDark ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const initials = (user?.name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className={styles.layout} data-theme={isDark ? "dark" : "light"}>
      <aside
        className={`${styles.sidebar} ${collapsed ? styles.collapsed : ""}`}
      >
        <div className={styles.logo}>
          <div className={styles.logoIcon}>LD</div>
          {!collapsed && <span className={styles.logoText}>Levants Dairy</span>}
        </div>

        <nav className={styles.nav}>
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`${styles.navItem} ${isActive ? styles.active : ""}`}
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
            <input
              type="text"
              placeholder="Search orders, products, customers..."
            />
          </div>

          <div className={styles.topbarActions}>
            <button
              className={styles.iconBtn}
              onClick={() => {
                const next = isDark ? "light" : "dark";
                void (async () => {
                  try {
                    await updateSelf({ preferences: { theme: next } } as any);
                  } catch {
                    // ignore
                  }
                })();
              }}
            >
              {isDark ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button className={styles.iconBtn}>
              <Bell size={20} />
              <span className={styles.notificationDot} />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={styles.userMenu}>
                  <div className={styles.avatar}>{initials || "U"}</div>
                  <div className={styles.userInfo}>
                    <span className={styles.userName}>
                      {user?.name || "Account"}
                    </span>
                    <span className={styles.userRole}>{roleLabel || ""}</span>
                  </div>
                </button>
              </DropdownMenuTrigger>

              <DropdownMenuContent align="end">
                <DropdownMenuLabel>
                  {user?.email || "Signed in"}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate("/settings")}>
                  <Settings size={16} style={{ marginRight: 8 }} />
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut size={16} style={{ marginRight: 8 }} />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
};
