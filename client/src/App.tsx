import {
  BrowserRouter,
  Routes,
  Route,
  Outlet,
  Navigate,
} from "react-router-dom";
import { AdminLayout } from "./components/layout/AdminLayout";
import { ToastProvider } from "./components/common/Toast";
import { LoadingScreen } from "./components/common";
import Dashboard from "./pages/Dashboard/Dashboard";
import Orders from "./pages/Orders/Orders";
import Deliveries from "./pages/Deliveries";
import Products from "./pages/Products/Products";
import ProductVariantsPage from "./pages/Products/ProductVariantsPage";
import Customers from "./pages/Customers/Customers";
import Promotions from "./pages/Promotions";
import Settings from "./pages/Settings/Settings";
import ComingSoon from "./pages/ComingSoon";
import Login from "./pages/Auth/Login";
import ForgotPassword from "./pages/Auth/ForgotPassword";
import ResetPassword from "./pages/Auth/ResetPassword";
import TwoFactor from "./pages/Auth/TwoFactor";
import VerifyEmailChange from "./pages/Auth/VerifyEmailChange";
import AcceptInvitationPage from "./pages/AcceptInvitationPage";
import { AuthProvider, useAuth } from "./context/Auth/AuthContext";
import { UsersProvider } from "./context/Users";
import { AccessProvider } from "./context/Access";
import { CustomersProvider } from "./context/Customers";
import { OrdersProvider } from "./context/Orders";
import { AnalyticsProvider } from "./context/Analytics";
import { RequirePermission } from "./components/auth/RequirePermission";
import { RequireNotRole } from "./components/auth/RequireNotRole";
import { RequireEmailDomain } from "./components/auth/RequireEmailDomain";
import { usePermissions } from "@/hooks/usePermissions";
import { DiscountsPage } from "./pages/Discounts";
import { DeliveryRunsPage, DeliveryRunDetailsPage } from "./pages/DeliveryRuns";
import { AnnouncementsPage } from "./pages/Announcements";
import { CategoriesPage } from "./pages/Categories";
import SubscriptionsPage from "./pages/Subscriptions/Subscriptions";
import SubscriptionDetailsPage from "./pages/Subscriptions/SubscriptionDetails";
import SupportRequestsPage from "./pages/SupportRequests/SupportRequests";
import PaymentsPage from "./pages/Payments/Payments";
import { SubscriptionsProvider } from "./context/Subscriptions";
import { SupportRequestsProvider } from "./context/SupportRequests";
import { PaymentsProvider } from "./context/Payments";
import "./styles/global.css";

const AdminShell = () => (
  <AdminLayout>
    <Outlet />
  </AdminLayout>
);

const PublicOnly = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading, twoFactorPending, authTransition } =
    useAuth();
  if (loading && !authTransition) return <LoadingScreen />;
  if (isAuthenticated) return <Navigate to="/" replace />;
  if (twoFactorPending?.tempToken) return <Navigate to="/2fa" replace />;
  return children;
};

const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading, twoFactorPending, authTransition } =
    useAuth();
  if (loading && !authTransition) return <LoadingScreen />;
  if (isAuthenticated) return children;
  if (twoFactorPending?.tempToken) return <Navigate to="/2fa" replace />;
  return <Navigate to="/login" replace />;
};

const AuthTransitionOverlay = () => {
  const { authTransition } = useAuth();
  if (!authTransition) return null;
  return (
    <LoadingScreen
      label={authTransition === "login" ? "Signing in…" : "Signing out…"}
    />
  );
};

const HomeRoute = () => {
  const { hasPermission, hasAnyPermission } = usePermissions();
  const { user } = useAuth();

  const roleName =
    typeof user?.role === "string" ? user.role : (user?.role as any)?.name;
  const isDriver = String(roleName || "") === "driver";

  if (hasPermission("analytics.read")) return <Dashboard />;

  const firstAllowed =
    (!isDriver && hasPermission("orders.read") && "/orders") ||
    (hasPermission("products.read") && "/products") ||
    (hasPermission("customers.read") && "/customers") ||
    (hasPermission("delivery.routes.read") && "/delivery-runs") ||
    (hasPermission("promotions.read") && "/promotions") ||
    (hasAnyPermission([
      "business.info.read",
      "business.info.update",
      "users.read",
      "users.update",
      "users.status.update",
      "users.roles.update",
    ]) &&
      "/settings") ||
    "/settings";

  if (firstAllowed) return <Navigate to={firstAllowed} replace />;
  return <Navigate to="/login" replace />;
};

const App = () => (
  <ToastProvider>
    <AuthProvider>
      <UsersProvider>
        <AccessProvider>
          <CustomersProvider>
            <OrdersProvider>
              <SubscriptionsProvider>
                <SupportRequestsProvider>
                  <PaymentsProvider>
                    <AnalyticsProvider>
                      <BrowserRouter
                        future={{
                          v7_startTransition: true,
                          v7_relativeSplatPath: true,
                        }}
                      >
                        <AuthTransitionOverlay />
                        <Routes>
                          <Route
                            path="/login"
                            element={
                              <PublicOnly>
                                <Login />
                              </PublicOnly>
                            }
                          />

                          <Route
                            path="/forgot-password"
                            element={<ForgotPassword />}
                          />
                          <Route
                            path="/accept-invitation"
                            element={<AcceptInvitationPage />}
                          />
                          <Route
                            path="/reset-password"
                            element={<ResetPassword />}
                          />
                          <Route
                            path="/verify-email-change"
                            element={<VerifyEmailChange />}
                          />
                          <Route path="/2fa" element={<TwoFactor />} />

                          <Route
                            element={
                              <RequireAuth>
                                <AdminShell />
                              </RequireAuth>
                            }
                          >
                            <Route path="/" element={<HomeRoute />} />
                            <Route
                              path="/orders"
                              element={
                                <RequirePermission permission="orders.read">
                                  <RequireNotRole
                                    role="driver"
                                    fallbackPath="/delivery-runs"
                                  >
                                    <Orders />
                                  </RequireNotRole>
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="/deliveries"
                              element={
                                <RequirePermission permission="delivery.routes.read">
                                  <Deliveries />
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="/delivery-runs"
                              element={
                                <RequirePermission permission="delivery.routes.read">
                                  <DeliveryRunsPage />
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="/delivery-runs/:id"
                              element={
                                <RequirePermission permission="delivery.routes.read">
                                  <DeliveryRunDetailsPage />
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="/products"
                              element={
                                <RequirePermission permission="products.read">
                                  <Products />
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="/products/:productId"
                              element={
                                <RequirePermission permission="products.read">
                                  <ProductVariantsPage />
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="/customers"
                              element={
                                <RequirePermission permission="customers.read">
                                  <Customers />
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="/subscriptions"
                              element={
                                <RequirePermission permission="orders.read">
                                  <SubscriptionsPage />
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="/subscriptions/:subscriptionId"
                              element={
                                <RequirePermission permission="orders.read">
                                  <SubscriptionDetailsPage />
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="/support-requests"
                              element={
                                <RequirePermission permission="customers.read">
                                  <SupportRequestsPage />
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="/payments"
                              element={
                                <RequirePermission permission="orders.read">
                                  <PaymentsPage />
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="/promotions"
                              element={
                                <RequirePermission permission="promotions.read">
                                  <Promotions />
                                </RequirePermission>
                              }
                            />

                            <Route
                              path="/discounts"
                              element={
                                <RequirePermission permission="promotions.read">
                                  <DiscountsPage />
                                </RequirePermission>
                              }
                            />
                            <Route
                              path="/announcements"
                              element={
                                <RequireEmailDomain domain="@litwebs.co.uk">
                                  <RequirePermission permission="announcements.read">
                                    <AnnouncementsPage />
                                  </RequirePermission>
                                </RequireEmailDomain>
                              }
                            />
                            <Route
                              path="/categories"
                              element={
                                <RequireEmailDomain domain="@litwebs.co.uk">
                                  <RequirePermission permission="categories.read">
                                    <CategoriesPage />
                                  </RequirePermission>
                                </RequireEmailDomain>
                              }
                            />
                            <Route
                              path="/content"
                              element={
                                <ComingSoon
                                  title="Content Management"
                                  description="Manage website content, banners, and marketing materials."
                                />
                              }
                            />
                            <Route
                              path="/reports"
                              element={<Navigate to="/" replace />}
                            />
                            <Route path="/settings" element={<Settings />} />
                          </Route>
                        </Routes>
                      </BrowserRouter>
                    </AnalyticsProvider>
                  </PaymentsProvider>
                </SupportRequestsProvider>
              </SubscriptionsProvider>
            </OrdersProvider>
          </CustomersProvider>
        </AccessProvider>
      </UsersProvider>
    </AuthProvider>
  </ToastProvider>
);

export default App;
