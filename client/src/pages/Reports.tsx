import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, Package,
  Download, BarChart3, FileText, Truck
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Button, Badge, Tabs, TabsList, TabsTrigger, TabsContent, Select } from '../components/common';
import { SimpleBarChart, HorizontalBarChart, DonutChart } from '../components/charts';
import { orders, products, customers, promotions } from '../data/mockData';
import styles from './Reports.module.css';

type DateRange = '7days' | '30days' | '90days' | '12months' | 'custom';
type ReportTab = 'overview' | 'sales' | 'products' | 'customers' | 'promotions';

const Reports: React.FC = () => {
  const [dateRange, setDateRange] = useState<DateRange>('30days');

  // Calculate metrics from mock data
  const metrics = useMemo(() => {
    const totalRevenue = orders.reduce((sum, o) => sum + o.total, 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const deliveredOrders = orders.filter(o => o.fulfillmentStatus === 'delivered').length;
    const deliveryRate = totalOrders > 0 ? (deliveredOrders / totalOrders) * 100 : 0;
    const totalCustomers = customers.length;
    const repeatCustomers = customers.filter(c => c.orderCount > 1).length;
    const repeatRate = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;
    
    return {
      totalRevenue,
      totalOrders,
      avgOrderValue,
      deliveryRate,
      totalCustomers,
      repeatCustomers,
      repeatRate,
      totalProducts: products.length,
      activeProducts: products.filter(p => p.status === 'active').length,
      lowStockProducts: products.filter(p => p.stock.quantity <= p.stock.lowStockThreshold).length
    };
  }, []);

  // Revenue data by period
  const revenueData = useMemo(() => {
    if (dateRange === '7days') {
      return [
        { label: 'Mon', value: 124.50 },
        { label: 'Tue', value: 189.20 },
        { label: 'Wed', value: 156.80 },
        { label: 'Thu', value: 210.45 },
        { label: 'Fri', value: 278.90 },
        { label: 'Sat', value: 195.30 },
        { label: 'Sun', value: 142.60 }
      ];
    } else if (dateRange === '30days') {
      return [
        { label: 'W1', value: 897.50 },
        { label: 'W2', value: 1024.20 },
        { label: 'W3', value: 1156.80 },
        { label: 'W4', value: 1298.45 }
      ];
    } else if (dateRange === '90days') {
      return [
        { label: 'Oct', value: 3245.80 },
        { label: 'Nov', value: 3892.40 },
        { label: 'Dec', value: 4376.95 }
      ];
    }
    return [
      { label: 'Jan', value: 2850.00 },
      { label: 'Feb', value: 2940.00 },
      { label: 'Mar', value: 3120.00 },
      { label: 'Apr', value: 3250.00 },
      { label: 'May', value: 3480.00 },
      { label: 'Jun', value: 3290.00 },
      { label: 'Jul', value: 3150.00 },
      { label: 'Aug', value: 3380.00 },
      { label: 'Sep', value: 3520.00 },
      { label: 'Oct', value: 3680.00 },
      { label: 'Nov', value: 3920.00 },
      { label: 'Dec', value: 4376.95 }
    ];
  }, [dateRange]);

  // Top products
  const topProducts = useMemo(() => {
    const productSales = products.map(p => {
      const soldUnits = orders.flatMap(o => o.items)
        .filter(i => i.productId === p.id)
        .reduce((sum, i) => sum + i.quantity, 0);
      const revenue = orders.flatMap(o => o.items)
        .filter(i => i.productId === p.id)
        .reduce((sum, i) => sum + (i.quantity * i.unitPrice), 0);
      return { ...p, soldUnits, revenue };
    }).sort((a, b) => b.revenue - a.revenue);
    
    const maxRevenue = productSales[0]?.revenue || 1;
    return productSales.slice(0, 5).map(p => ({
      label: p.name,
      value: p.soldUnits,
      percentage: (p.revenue / maxRevenue) * 100,
      revenue: p.revenue
    }));
  }, []);

  // Category distribution
  const categoryData = useMemo(() => {
    const categories = ['Milk', 'Milkshakes', 'Cream', 'Honey', 'Butter', 'Cheese'];
    const colors = ['#1a5f4a', '#2d8268', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'];
    
    return categories.map((cat, i) => {
      const categoryProducts = products.filter(p => p.category === cat);
      const revenue = orders.flatMap(o => o.items)
        .filter(item => categoryProducts.some(p => p.id === item.productId))
        .reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      return { label: cat, value: Math.round(revenue), color: colors[i] };
    }).filter(c => c.value > 0);
  }, []);

  // Order status distribution
  const orderStatusData = useMemo(() => [
    { label: 'New', value: orders.filter(o => o.fulfillmentStatus === 'new').length, color: '#8b5cf6' },
    { label: 'Preparing', value: orders.filter(o => o.fulfillmentStatus === 'preparing').length, color: '#f59e0b' },
    { label: 'Out for Delivery', value: orders.filter(o => o.fulfillmentStatus === 'out_for_delivery').length, color: '#06b6d4' },
    { label: 'Delivered', value: orders.filter(o => o.fulfillmentStatus === 'delivered').length, color: '#10b981' },
    { label: 'Cancelled', value: orders.filter(o => o.fulfillmentStatus === 'cancelled').length, color: '#ef4444' }
  ], []);

  // Customer segments
  const customerSegments = useMemo(() => {
    const vip = customers.filter(c => c.tags.includes('VIP')).length;
    const regular = customers.filter(c => c.orderCount > 3 && !c.tags.includes('VIP')).length;
    const occasional = customers.filter(c => c.orderCount >= 1 && c.orderCount <= 3).length;
    const inactive = customers.filter(c => c.orderCount === 0).length;
    
    return [
      { label: 'VIP', value: vip, color: '#8b5cf6' },
      { label: 'Regular', value: regular, color: '#1a5f4a' },
      { label: 'Occasional', value: occasional, color: '#f59e0b' },
      { label: 'Inactive', value: inactive, color: '#9ca3af' }
    ].filter(s => s.value > 0);
  }, []);

  // Top customers
  const topCustomers = useMemo(() => {
    const sorted = [...customers].sort((a, b) => b.totalSpent - a.totalSpent);
    const maxSpent = sorted[0]?.totalSpent || 1;
    return sorted.slice(0, 5).map(c => ({
      label: c.name,
      value: c.orderCount,
      percentage: (c.totalSpent / maxSpent) * 100,
      totalSpent: c.totalSpent
    }));
  }, []);

  // Promotion performance
  const promotionPerformance = useMemo(() => {
    return promotions
      .filter(p => p.status === 'active' && p.usageCount > 0)
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, 5);
  }, []);

  const handleExport = (format: 'csv' | 'pdf') => {
    const reportName = `report-${dateRange}`;
    console.log(`Exporting ${reportName}.${format}`);
    alert(`Report exported as ${reportName}.${format}`);
  };

  const dateRangeOptions = [
    { value: '7days', label: 'Last 7 Days' },
    { value: '30days', label: 'Last 30 Days' },
    { value: '90days', label: 'Last 90 Days' },
    { value: '12months', label: 'Last 12 Months' }
  ];

  const totalRevenueInPeriod = revenueData.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className={styles.reports}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Reports & Analytics</h1>
          <p className={styles.subtitle}>Insights into your business performance</p>
        </div>
        <div className={styles.headerActions}>
          <Select
            value={dateRange}
            onChange={(value) => setDateRange(value as DateRange)}
            options={dateRangeOptions}
          />
          <Button variant="outline" leftIcon={<Download size={16} />} onClick={() => handleExport('csv')}>
            Export CSV
          </Button>
          <Button variant="outline" leftIcon={<FileText size={16} />} onClick={() => handleExport('pdf')}>
            Export PDF
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview"><BarChart3 size={16} /> Overview</TabsTrigger>
          <TabsTrigger value="sales"><DollarSign size={16} /> Sales</TabsTrigger>
          <TabsTrigger value="products"><Package size={16} /> Products</TabsTrigger>
          <TabsTrigger value="customers"><Users size={16} /> Customers</TabsTrigger>
          <TabsTrigger value="promotions"><TrendingUp size={16} /> Promotions</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          {/* KPI Cards */}
          <div className={styles.kpiGrid}>
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.success}`}>
                  <DollarSign size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Total Revenue</span>
                  <span className={styles.kpiValue}>£{totalRevenueInPeriod.toFixed(2)}</span>
                  <div className={styles.kpiTrend}>
                    <TrendingUp size={14} />
                    <span className={styles.trendUp}>+12.5%</span>
                    <span className={styles.trendLabel}>vs previous period</span>
                  </div>
                </div>
              </div>
            </Card>
            
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.primary}`}>
                  <ShoppingCart size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Total Orders</span>
                  <span className={styles.kpiValue}>{metrics.totalOrders}</span>
                  <div className={styles.kpiTrend}>
                    <TrendingUp size={14} />
                    <span className={styles.trendUp}>+8.2%</span>
                    <span className={styles.trendLabel}>vs previous period</span>
                  </div>
                </div>
              </div>
            </Card>
            
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.info}`}>
                  <Users size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Customers</span>
                  <span className={styles.kpiValue}>{metrics.totalCustomers}</span>
                  <div className={styles.kpiTrend}>
                    <TrendingUp size={14} />
                    <span className={styles.trendUp}>+15.3%</span>
                    <span className={styles.trendLabel}>vs previous period</span>
                  </div>
                </div>
              </div>
            </Card>
            
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.warning}`}>
                  <BarChart3 size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Avg Order Value</span>
                  <span className={styles.kpiValue}>£{metrics.avgOrderValue.toFixed(2)}</span>
                  <div className={styles.kpiTrend}>
                    <TrendingDown size={14} />
                    <span className={styles.trendDown}>-2.1%</span>
                    <span className={styles.trendLabel}>vs previous period</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Charts Row */}
          <div className={styles.chartsGrid}>
            <Card className={styles.chartCard}>
              <CardHeader>
                <CardTitle>Revenue Trend</CardTitle>
              </CardHeader>
              <CardContent>
                <SimpleBarChart data={revenueData} type="bar" height={240} color="success" />
                <div className={styles.chartFooter}>
                  <span className={styles.chartTotal}>Period Total: £{totalRevenueInPeriod.toFixed(2)}</span>
                </div>
              </CardContent>
            </Card>

            <Card className={styles.chartCard}>
              <CardHeader>
                <CardTitle>Order Status</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart 
                  data={orderStatusData} 
                  size={160}
                  centerLabel="Orders"
                  centerValue={String(metrics.totalOrders)}
                />
              </CardContent>
            </Card>
          </div>

          {/* Second Row */}
          <div className={styles.chartsGrid}>
            <Card className={styles.chartCard}>
              <CardHeader>
                <CardTitle>Top Products</CardTitle>
              </CardHeader>
              <CardContent>
                <HorizontalBarChart data={topProducts} color="primary" />
              </CardContent>
            </Card>

            <Card className={styles.chartCard}>
              <CardHeader>
                <CardTitle>Revenue by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart 
                  data={categoryData} 
                  size={160}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Sales Tab */}
        <TabsContent value="sales">
          {/* Sales KPIs */}
          <div className={styles.kpiGrid}>
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.success}`}>
                  <DollarSign size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Gross Revenue</span>
                  <span className={styles.kpiValue}>£{totalRevenueInPeriod.toFixed(2)}</span>
                </div>
              </div>
            </Card>
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.warning}`}>
                  <Truck size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Delivery Fees</span>
                  <span className={styles.kpiValue}>£{orders.reduce((sum, o) => sum + o.deliveryFee, 0).toFixed(2)}</span>
                </div>
              </div>
            </Card>
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.error}`}>
                  <TrendingDown size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Discounts Given</span>
                  <span className={styles.kpiValue}>£{orders.reduce((sum, o) => sum + o.discount, 0).toFixed(2)}</span>
                </div>
              </div>
            </Card>
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.info}`}>
                  <ShoppingCart size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Avg Order Value</span>
                  <span className={styles.kpiValue}>£{metrics.avgOrderValue.toFixed(2)}</span>
                </div>
              </div>
            </Card>
          </div>

          <Card className={styles.fullWidthChart}>
            <CardHeader>
              <CardTitle>Revenue Over Time</CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleBarChart data={revenueData} type="bar" height={280} color="success" />
            </CardContent>
          </Card>

          {/* Payment Status */}
          <div className={styles.chartsGrid}>
            <Card className={styles.chartCard}>
              <CardHeader>
                <CardTitle>Payment Status</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart 
                  data={[
                    { label: 'Paid', value: orders.filter(o => o.paymentStatus === 'paid').length, color: '#10b981' },
                    { label: 'Unpaid', value: orders.filter(o => o.paymentStatus === 'unpaid').length, color: '#f59e0b' },
                    { label: 'Refunded', value: orders.filter(o => o.paymentStatus === 'refunded').length, color: '#ef4444' }
                  ]} 
                  size={160}
                />
              </CardContent>
            </Card>

            <Card className={styles.chartCard}>
              <CardHeader>
                <CardTitle>Fulfillment Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={styles.metricsGrid}>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>{metrics.deliveryRate.toFixed(1)}%</span>
                    <span className={styles.metricLabel}>Delivery Success Rate</span>
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>{orders.filter(o => o.fulfillmentStatus === 'cancelled').length}</span>
                    <span className={styles.metricLabel}>Cancelled Orders</span>
                  </div>
                  <div className={styles.metricItem}>
                    <span className={styles.metricValue}>{orders.filter(o => o.paymentStatus === 'refunded').length}</span>
                    <span className={styles.metricLabel}>Refunds Issued</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products">
          {/* Product KPIs */}
          <div className={styles.kpiGrid}>
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.primary}`}>
                  <Package size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Total Products</span>
                  <span className={styles.kpiValue}>{metrics.totalProducts}</span>
                </div>
              </div>
            </Card>
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.success}`}>
                  <Package size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Active Products</span>
                  <span className={styles.kpiValue}>{metrics.activeProducts}</span>
                </div>
              </div>
            </Card>
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.warning}`}>
                  <Package size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Low Stock</span>
                  <span className={styles.kpiValue}>{metrics.lowStockProducts}</span>
                </div>
              </div>
            </Card>
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.info}`}>
                  <BarChart3 size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Categories</span>
                  <span className={styles.kpiValue}>{categoryData.length}</span>
                </div>
              </div>
            </Card>
          </div>

          <div className={styles.chartsGrid}>
            <Card className={styles.chartCard}>
              <CardHeader>
                <CardTitle>Best Selling Products</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={styles.productRanking}>
                  {topProducts.map((product, index) => (
                    <div key={product.label} className={styles.rankItem}>
                      <span className={styles.rankNumber}>#{index + 1}</span>
                      <div className={styles.rankInfo}>
                        <span className={styles.rankName}>{product.label}</span>
                        <span className={styles.rankMeta}>{product.value} units · £{product.revenue?.toFixed(2)}</span>
                      </div>
                      <div className={styles.rankBar}>
                        <div 
                          className={styles.rankFill} 
                          style={{ width: `${product.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className={styles.chartCard}>
              <CardHeader>
                <CardTitle>Sales by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart 
                  data={categoryData} 
                  size={160}
                />
              </CardContent>
            </Card>
          </div>

          {/* Stock Status */}
          <Card>
            <CardHeader>
              <CardTitle>Inventory Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={styles.inventoryGrid}>
                {products.map(product => {
                  const stockPercent = product.stock.lowStockThreshold > 0 
                    ? (product.stock.quantity / (product.stock.lowStockThreshold * 3)) * 100 
                    : 100;
                  const isLow = product.stock.quantity <= product.stock.lowStockThreshold;
                  
                  return (
                    <div key={product.id} className={styles.inventoryItem}>
                      <div className={styles.inventoryHeader}>
                        <span className={styles.inventoryName}>{product.name}</span>
                        {isLow && <Badge variant="error" size="sm">Low Stock</Badge>}
                      </div>
                      <div className={styles.inventoryBar}>
                        <div 
                          className={`${styles.inventoryFill} ${isLow ? styles.low : ''}`}
                          style={{ width: `${Math.min(stockPercent, 100)}%` }}
                        />
                      </div>
                      <span className={styles.inventoryCount}>{product.stock.quantity} units</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Customers Tab */}
        <TabsContent value="customers">
          {/* Customer KPIs */}
          <div className={styles.kpiGrid}>
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.primary}`}>
                  <Users size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Total Customers</span>
                  <span className={styles.kpiValue}>{metrics.totalCustomers}</span>
                </div>
              </div>
            </Card>
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.success}`}>
                  <Users size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Repeat Customers</span>
                  <span className={styles.kpiValue}>{metrics.repeatCustomers}</span>
                </div>
              </div>
            </Card>
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.info}`}>
                  <TrendingUp size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Repeat Rate</span>
                  <span className={styles.kpiValue}>{metrics.repeatRate.toFixed(1)}%</span>
                </div>
              </div>
            </Card>
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.warning}`}>
                  <DollarSign size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Avg Lifetime Value</span>
                  <span className={styles.kpiValue}>£{(customers.reduce((sum, c) => sum + c.totalSpent, 0) / metrics.totalCustomers).toFixed(2)}</span>
                </div>
              </div>
            </Card>
          </div>

          <div className={styles.chartsGrid}>
            <Card className={styles.chartCard}>
              <CardHeader>
                <CardTitle>Top Customers by Spending</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={styles.customerRanking}>
                  {topCustomers.map((customer, index) => (
                    <div key={customer.label} className={styles.rankItem}>
                      <span className={styles.rankNumber}>#{index + 1}</span>
                      <div className={styles.rankInfo}>
                        <span className={styles.rankName}>{customer.label}</span>
                        <span className={styles.rankMeta}>{customer.value} orders · £{customer.totalSpent?.toFixed(2)}</span>
                      </div>
                      <div className={styles.rankBar}>
                        <div 
                          className={`${styles.rankFill} ${styles.customer}`}
                          style={{ width: `${customer.percentage}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className={styles.chartCard}>
              <CardHeader>
                <CardTitle>Customer Segments</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart 
                  data={customerSegments} 
                  size={160}
                />
              </CardContent>
            </Card>
          </div>

          {/* Marketing Opt-in */}
          <Card>
            <CardHeader>
              <CardTitle>Marketing & Engagement</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={styles.engagementGrid}>
                <div className={styles.engagementCard}>
                  <span className={styles.engagementValue}>
                    {customers.filter(c => c.marketingOptIn).length}
                  </span>
                  <span className={styles.engagementLabel}>Marketing Opt-ins</span>
                  <span className={styles.engagementPercent}>
                    {((customers.filter(c => c.marketingOptIn).length / metrics.totalCustomers) * 100).toFixed(0)}% of customers
                  </span>
                </div>
                <div className={styles.engagementCard}>
                  <span className={styles.engagementValue}>
                    {customers.filter(c => c.tags.includes('VIP')).length}
                  </span>
                  <span className={styles.engagementLabel}>VIP Customers</span>
                  <span className={styles.engagementPercent}>
                    Top tier loyalty
                  </span>
                </div>
                <div className={styles.engagementCard}>
                  <span className={styles.engagementValue}>
                    {customers.filter(c => c.notes).length}
                  </span>
                  <span className={styles.engagementLabel}>With Notes</span>
                  <span className={styles.engagementPercent}>
                    Special preferences recorded
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Promotions Tab */}
        <TabsContent value="promotions">
          {/* Promotion KPIs */}
          <div className={styles.kpiGrid}>
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.primary}`}>
                  <TrendingUp size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Active Promotions</span>
                  <span className={styles.kpiValue}>{promotions.filter(p => p.status === 'active' && p.isEnabled).length}</span>
                </div>
              </div>
            </Card>
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.success}`}>
                  <ShoppingCart size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Total Redemptions</span>
                  <span className={styles.kpiValue}>{promotions.reduce((sum, p) => sum + p.usageCount, 0)}</span>
                </div>
              </div>
            </Card>
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.info}`}>
                  <DollarSign size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Promo Codes</span>
                  <span className={styles.kpiValue}>{promotions.filter(p => p.type === 'promo_code').length}</span>
                </div>
              </div>
            </Card>
            <Card className={styles.kpiCard}>
              <div className={styles.kpiContent}>
                <div className={`${styles.kpiIcon} ${styles.warning}`}>
                  <Package size={24} />
                </div>
                <div className={styles.kpiInfo}>
                  <span className={styles.kpiLabel}>Archived</span>
                  <span className={styles.kpiValue}>{promotions.filter(p => p.status === 'archived').length}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Top Performing Promotions */}
          <Card>
            <CardHeader>
              <CardTitle>Top Performing Promotions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={styles.promoList}>
                {promotionPerformance.length === 0 ? (
                  <p className={styles.emptyState}>No promotions with usage data yet.</p>
                ) : (
                  promotionPerformance.map((promo, index) => (
                    <div key={promo.id} className={styles.promoItem}>
                      <div className={styles.promoRank}>#{index + 1}</div>
                      <div className={styles.promoInfo}>
                        <span className={styles.promoName}>{promo.name}</span>
                        <div className={styles.promoMeta}>
                          <Badge variant="default" size="sm">{promo.type.replace(/_/g, ' ')}</Badge>
                          {promo.code && <span className={styles.promoCode}>{promo.code}</span>}
                          {promo.discountKind !== 'none' && promo.discountValue && (
                            <span className={styles.promoDiscount}>
                              {promo.discountKind === 'percent' ? `${promo.discountValue}% off` : `£${promo.discountValue} off`}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={styles.promoStats}>
                        <span className={styles.promoUsage}>{promo.usageCount} uses</span>
                        {promo.usageLimit && (
                          <span className={styles.promoLimit}>of {promo.usageLimit}</span>
                        )}
                      </div>
                      <div className={styles.promoProgress}>
                        <div 
                          className={styles.promoProgressFill}
                          style={{ width: `${promo.usageLimit ? (promo.usageCount / promo.usageLimit) * 100 : 50}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Promotion Types */}
          <div className={styles.chartsGrid}>
            <Card className={styles.chartCard}>
              <CardHeader>
                <CardTitle>Promotions by Type</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart 
                  data={[
                    { label: 'Promo Code', value: promotions.filter(p => p.type === 'promo_code').length, color: '#1a5f4a' },
                    { label: 'Banner', value: promotions.filter(p => p.type === 'banner').length, color: '#3b82f6' },
                    { label: 'Free Shipping', value: promotions.filter(p => p.type === 'free_shipping').length, color: '#f59e0b' },
                    { label: 'Product Discount', value: promotions.filter(p => p.type === 'product_discount').length, color: '#8b5cf6' }
                  ].filter(d => d.value > 0)} 
                  size={160}
                />
              </CardContent>
            </Card>

            <Card className={styles.chartCard}>
              <CardHeader>
                <CardTitle>Promotion Status</CardTitle>
              </CardHeader>
              <CardContent>
                <DonutChart 
                  data={[
                    { label: 'Active & Enabled', value: promotions.filter(p => p.status === 'active' && p.isEnabled).length, color: '#10b981' },
                    { label: 'Active & Disabled', value: promotions.filter(p => p.status === 'active' && !p.isEnabled).length, color: '#f59e0b' },
                    { label: 'Archived', value: promotions.filter(p => p.status === 'archived').length, color: '#9ca3af' }
                  ].filter(d => d.value > 0)} 
                  size={160}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;
