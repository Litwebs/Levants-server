import {
  BrowserRouter,
  Routes,
  Route,
  Outlet,
  Navigate,
} from "react-router-dom";
import { AdminLayout } from "./components/layout/AdminLayout";
import { ToastProvider } from "./components/common/Toast";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders/Orders";
import Deliveries from "./pages/Deliveries";
import Products from "./pages/Products/Products";
import Customers from "./pages/Customers/Customers";
import Promotions from "./pages/Promotions";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings/Settings";
import ComingSoon from "./pages/ComingSoon";
import Login from "./pages/Auth/Login";
import ForgotPassword from "./pages/Auth/ForgotPassword";
import ResetPassword from "./pages/Auth/ResetPassword";
import TwoFactor from "./pages/Auth/TwoFactor";
import { AuthProvider, useAuth } from "./context/Auth/AuthContext";
import {
  DeliveryRunsPage,
  DeliveryRunDetailsPage,
} from "./features/deliveryRuns";
import "./styles/global.css";

const AdminShell = () => (
  <AdminLayout>
    <Outlet />
  </AdminLayout>
);

const PublicOnly = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading, twoFactorPending } = useAuth();
  if (loading) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;
  if (twoFactorPending?.tempToken) return <Navigate to="/2fa" replace />;
  return children;
};

const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, loading, twoFactorPending } = useAuth();
  if (loading) return null;
  if (isAuthenticated) return children;
  if (twoFactorPending?.tempToken) return <Navigate to="/2fa" replace />;
  return <Navigate to="/login" replace />;
};

const App = () => (
  <ToastProvider>
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnly>
                <Login />
              </PublicOnly>
            }
          />

          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/2fa" element={<TwoFactor />} />

          <Route
            element={
              <RequireAuth>
                <AdminShell />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Dashboard />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/deliveries" element={<Deliveries />} />
            <Route path="/delivery-runs" element={<DeliveryRunsPage />} />
            <Route
              path="/delivery-runs/:id"
              element={<DeliveryRunDetailsPage />}
            />
            <Route path="/products" element={<Products />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/promotions" element={<Promotions />} />
            <Route
              path="/content"
              element={
                <ComingSoon
                  title="Content Management"
                  description="Manage website content, banners, and marketing materials."
                />
              }
            />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </ToastProvider>
);

export default App;
