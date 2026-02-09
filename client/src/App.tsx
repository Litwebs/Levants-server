import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AdminLayout } from './components/layout/AdminLayout';
import { ToastProvider } from './components/common/Toast';
import Dashboard from './pages/Dashboard';
import Orders from './pages/Orders';
import Deliveries from './pages/Deliveries';
import Products from './pages/Products';
import Customers from './pages/Customers';
import Promotions from './pages/Promotions';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import ComingSoon from './pages/ComingSoon';
import { DeliveryRunsPage, DeliveryRunDetailsPage } from './features/deliveryRuns';
import './styles/global.css';

const App = () => (
  <ToastProvider>
    <BrowserRouter>
      <AdminLayout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/deliveries" element={<Deliveries />} />
          <Route path="/delivery-runs" element={<DeliveryRunsPage />} />
          <Route path="/delivery-runs/:id" element={<DeliveryRunDetailsPage />} />
          <Route path="/products" element={<Products />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/promotions" element={<Promotions />} />
          <Route path="/content" element={<ComingSoon title="Content Management" description="Manage website content, banners, and marketing materials." />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </AdminLayout>
    </BrowserRouter>
  </ToastProvider>
);

export default App;
