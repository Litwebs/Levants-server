import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ShoppingCart, DollarSign, Clock, Truck, CheckCircle, 
  AlertTriangle, Plus, Eye, ArrowUpRight, TrendingUp, Package,
  Calendar, Users, RefreshCw
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge } from '../components/common';
import { SimpleBarChart, HorizontalBarChart, DonutChart } from '../components/charts';
import { getDashboardStats, orders, products, customers } from '../data/mockData';
import styles from './Dashboard.module.css';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const stats = getDashboardStats();
  const [selectedPeriod, setSelectedPeriod] = useState<'7days' | '30days'>('7days');

  const statCards = [
    { label: 'Orders Today', value: stats.ordersToday, icon: ShoppingCart, color: 'primary', change: '+12%' },
    { label: 'Revenue Today', value: `£${stats.revenueToday.toFixed(2)}`, icon: DollarSign, color: 'success', change: '+8%' },
    { label: 'Pending Prep', value: stats.pendingPreparation, icon: Clock, color: 'warning' },
    { label: 'Out for Delivery', value: stats.outForDelivery, icon: Truck, color: 'info' },
    { label: 'Delivered', value: stats.delivered, icon: CheckCircle, color: 'success' },
    { label: 'Low Stock Items', value: stats.lowStockItems, icon: AlertTriangle, color: 'error' },
  ];

  // Revenue data for chart (mock weekly data)
  const revenueData = selectedPeriod === '7days' 
    ? [
        { label: 'Mon', value: 124.50 },
        { label: 'Tue', value: 189.20 },
        { label: 'Wed', value: 156.80 },
        { label: 'Thu', value: 210.45 },
        { label: 'Fri', value: 278.90 },
        { label: 'Sat', value: 195.30 },
        { label: 'Sun', value: 142.60 },
      ]
    : [
        { label: 'W1', value: 897.50 },
        { label: 'W2', value: 1024.20 },
        { label: 'W3', value: 1156.80 },
        { label: 'W4', value: 1298.45 },
      ];

  // Top products data
  const topProducts = [
    { label: 'Farm Fresh Milk', value: 89, percentage: 100 },
    { label: 'Mature Cheddar', value: 67, percentage: 75 },
    { label: 'Farm Fresh Milkshake', value: 54, percentage: 61 },
    { label: 'Farm Butter', value: 42, percentage: 47 },
    { label: 'Fresh Double Cream', value: 38, percentage: 43 },
  ];

  // Order status distribution
  const orderStatusData = [
    { label: 'New', value: orders.filter(o => o.fulfillmentStatus === 'new').length, color: '#3b82f6' },
    { label: 'Preparing', value: orders.filter(o => o.fulfillmentStatus === 'preparing').length, color: '#f59e0b' },
    { label: 'Out for Delivery', value: orders.filter(o => o.fulfillmentStatus === 'out_for_delivery').length, color: '#8b5cf6' },
    { label: 'Delivered', value: orders.filter(o => o.fulfillmentStatus === 'delivered').length, color: '#22c55e' },
    { label: 'Cancelled', value: orders.filter(o => o.fulfillmentStatus === 'cancelled').length, color: '#ef4444' },
  ];

  const recentOrders = orders.slice(0, 5);
  const lowStockProducts = products.filter(p => p.stock.quantity <= p.stock.lowStockThreshold);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
      new: 'info',
      confirmed: 'info',
      preparing: 'warning',
      out_for_delivery: 'info',
      delivered: 'success',
      cancelled: 'error'
    };
    return <Badge variant={variants[status] || 'default'}>{status.replace(/_/g, ' ')}</Badge>;
  };

  const getPaymentBadge = (status: string) => {
    const variants: Record<string, 'success' | 'warning' | 'error' | 'default'> = {
      paid: 'success',
      unpaid: 'warning',
      refunded: 'error',
      partially_refunded: 'warning'
    };
    return <Badge variant={variants[status] || 'default'} size="sm">{status.replace(/_/g, ' ')}</Badge>;
  };

  const totalRevenue = revenueData.reduce((sum, d) => sum + d.value, 0);
  const totalOrders = orders.length;

  return (
    <div className={styles.dashboard}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>Welcome back! Here's what's happening today.</p>
        </div>
        <div className={styles.actions}>
          <Button variant="outline" leftIcon={<Eye size={16} />} onClick={() => navigate('/orders')}>
            View New Orders
          </Button>
          <Button variant="primary" leftIcon={<Plus size={16} />} onClick={() => navigate('/products')}>
            Create Product
          </Button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <Card key={i} className={styles.statCard}>
              <div className={styles.statContent}>
                <div className={`${styles.statIcon} ${styles[stat.color]}`}>
                  <Icon size={20} />
                </div>
                <div className={styles.statInfo}>
                  <p className={styles.statLabel}>{stat.label}</p>
                  <div className={styles.statRow}>
                    <p className={styles.statValue}>{stat.value}</p>
                    {stat.change && (
                      <span className={styles.statChange}>{stat.change}</span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Summary Cards */}
      <div className={styles.summaryGrid}>
        <Card className={styles.summaryCard}>
          <div className={styles.summaryContent}>
            <div className={`${styles.summaryIcon} ${styles.info}`}>
              <Calendar size={24} />
            </div>
            <div>
              <p className={styles.summaryValue}>{totalOrders}</p>
              <p className={styles.summaryLabel}>Total Orders This Week</p>
            </div>
          </div>
        </Card>
        <Card className={styles.summaryCard}>
          <div className={styles.summaryContent}>
            <div className={`${styles.summaryIcon} ${styles.success}`}>
              <DollarSign size={24} />
            </div>
            <div>
              <p className={styles.summaryValue}>£{stats.revenueWeek.toFixed(2)}</p>
              <p className={styles.summaryLabel}>Revenue This Week</p>
            </div>
          </div>
        </Card>
        <Card className={styles.summaryCard}>
          <div className={styles.summaryContent}>
            <div className={`${styles.summaryIcon} ${styles.primary}`}>
              <Users size={24} />
            </div>
            <div>
              <p className={styles.summaryValue}>{customers.length}</p>
              <p className={styles.summaryLabel}>Active Customers</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Charts Row */}
      <div className={styles.chartsGrid}>
        <Card className={styles.chartCard}>
          <CardHeader 
            action={
              <div className={styles.periodToggle}>
                <button 
                  className={`${styles.periodBtn} ${selectedPeriod === '7days' ? styles.active : ''}`}
                  onClick={() => setSelectedPeriod('7days')}
                >
                  7 Days
                </button>
                <button 
                  className={`${styles.periodBtn} ${selectedPeriod === '30days' ? styles.active : ''}`}
                  onClick={() => setSelectedPeriod('30days')}
                >
                  30 Days
                </button>
              </div>
            }
          >
            <CardTitle>Revenue Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleBarChart data={revenueData} type="bar" height={220} color="success" />
            <div className={styles.chartFooter}>
              <span className={styles.chartTotal}>Total: £{totalRevenue.toFixed(2)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className={styles.chartCard}>
          <CardHeader>
            <CardTitle>Top Products</CardTitle>
          </CardHeader>
          <CardContent>
            <HorizontalBarChart data={topProducts} color="primary" />
          </CardContent>
        </Card>
      </div>

      {/* Orders and Stock Row */}
      <div className={styles.grid}>
        <Card className={styles.ordersCard}>
          <CardHeader action={
            <Button variant="ghost" size="sm" rightIcon={<ArrowUpRight size={14} />} onClick={() => navigate('/orders')}>
              View All
            </Button>
          }>
            <CardTitle>Recent Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={styles.ordersList}>
              {recentOrders.map(order => (
                <div key={order.id} className={styles.orderItem} onClick={() => navigate('/orders')}>
                  <div className={styles.orderInfo}>
                    <span className={styles.orderNumber}>{order.orderNumber}</span>
                    <span className={styles.orderCustomer}>{order.customer.name}</span>
                    <span className={styles.orderDate}>
                      {new Date(order.createdAt).toLocaleDateString('en-GB', { 
                        day: 'numeric', 
                        month: 'short' 
                      })}
                    </span>
                  </div>
                  <div className={styles.orderMeta}>
                    <div className={styles.orderBadges}>
                      {getStatusBadge(order.fulfillmentStatus)}
                      {getPaymentBadge(order.paymentStatus)}
                    </div>
                    <span className={styles.orderTotal}>£{order.total.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className={styles.sideColumn}>
          <Card className={styles.statusCard}>
            <CardHeader>
              <CardTitle>Order Status</CardTitle>
            </CardHeader>
            <CardContent>
              <DonutChart 
                data={orderStatusData} 
                size={120}
              />
            </CardContent>
          </Card>

          <Card className={styles.stockCard}>
            <CardHeader action={
              <Button variant="ghost" size="sm" rightIcon={<ArrowUpRight size={14} />} onClick={() => navigate('/products')}>
                View All
              </Button>
            }>
              <CardTitle>Low Stock Alert</CardTitle>
            </CardHeader>
            <CardContent>
              {lowStockProducts.length === 0 ? (
                <p className={styles.emptyState}>All products are well stocked!</p>
              ) : (
                <div className={styles.stockList}>
                  {lowStockProducts.map(product => (
                    <div key={product.id} className={styles.stockItem}>
                      <Package size={18} className={styles.stockIcon} />
                      <div className={styles.stockInfo}>
                        <span className={styles.stockName}>{product.name}</span>
                        <span className={styles.stockQty}>{product.stock.quantity} remaining</span>
                      </div>
                      <Badge variant="error" size="sm">Low</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className={styles.quickActions}>
            <Button variant="outline" leftIcon={<ShoppingCart size={16} />} onClick={() => navigate('/orders')}>
              Process Orders
            </Button>
            <Button variant="outline" leftIcon={<Truck size={16} />} onClick={() => navigate('/deliveries')}>
              Generate Routes
            </Button>
            <Button variant="outline" leftIcon={<Package size={16} />} onClick={() => navigate('/products')}>
              Update Inventory
            </Button>
            <Button variant="outline" leftIcon={<TrendingUp size={16} />} onClick={() => navigate('/reports')}>
              View Reports
            </Button>
            <Button variant="outline" leftIcon={<RefreshCw size={16} />}>
              Refresh Data
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
