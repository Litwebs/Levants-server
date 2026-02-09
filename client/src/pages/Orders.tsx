import React, { useState, useMemo } from 'react';
import { 
  Search, Filter, Download, MoreVertical, Eye, Edit, 
  Printer, X, Clock, Truck, CheckCircle, Package, 
  ChevronDown, Calendar, RefreshCw
} from 'lucide-react';
import { 
  Card, CardHeader, CardTitle, CardContent, Button, Badge, 
  Input, Select, Modal, ModalFooter 
} from '../components/common';
import { orders as mockOrders, Order } from '../data/mockData';
import { useToast } from '../components/common/Toast';
import styles from './Orders.module.css';

type FulfillmentStatus = Order['fulfillmentStatus'];
type PaymentStatus = Order['paymentStatus'];

const Orders: React.FC = () => {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>(mockOrders);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('newest');
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filter and sort orders
  const filteredOrders = useMemo(() => {
    let result = [...orders];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(order => 
        order.orderNumber.toLowerCase().includes(query) ||
        order.customer.name.toLowerCase().includes(query) ||
        order.customer.email.toLowerCase().includes(query) ||
        order.deliveryAddress.postcode.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(order => order.fulfillmentStatus === statusFilter);
    }

    // Payment filter
    if (paymentFilter !== 'all') {
      result = result.filter(order => order.paymentStatus === paymentFilter);
    }

    // Date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      const today = now.toISOString().split('T')[0];
      result = result.filter(order => {
        const orderDate = new Date(order.createdAt);
        if (dateFilter === 'today') {
          return order.createdAt.startsWith(today);
        } else if (dateFilter === 'week') {
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          return orderDate >= weekAgo;
        } else if (dateFilter === 'month') {
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          return orderDate >= monthAgo;
        }
        return true;
      });
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'newest') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else if (sortBy === 'oldest') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      } else if (sortBy === 'total-high') {
        return b.total - a.total;
      } else if (sortBy === 'total-low') {
        return a.total - b.total;
      } else if (sortBy === 'delivery') {
        return new Date(a.deliverySlot.date).getTime() - new Date(b.deliverySlot.date).getTime();
      }
      return 0;
    });

    return result;
  }, [orders, searchQuery, statusFilter, paymentFilter, dateFilter, sortBy]);

  // Status badge component
  const getStatusBadge = (status: FulfillmentStatus) => {
    const config: Record<FulfillmentStatus, { variant: 'success' | 'warning' | 'error' | 'info' | 'default'; label: string }> = {
      new: { variant: 'info', label: 'New' },
      confirmed: { variant: 'info', label: 'Confirmed' },
      preparing: { variant: 'warning', label: 'Preparing' },
      out_for_delivery: { variant: 'info', label: 'Out for Delivery' },
      delivered: { variant: 'success', label: 'Delivered' },
      cancelled: { variant: 'error', label: 'Cancelled' }
    };
    const { variant, label } = config[status];
    return <Badge variant={variant}>{label}</Badge>;
  };

  const getPaymentBadge = (status: PaymentStatus) => {
    const config: Record<PaymentStatus, { variant: 'success' | 'warning' | 'error' | 'default'; label: string }> = {
      paid: { variant: 'success', label: 'Paid' },
      unpaid: { variant: 'warning', label: 'Unpaid' },
      refunded: { variant: 'error', label: 'Refunded' },
      partially_refunded: { variant: 'warning', label: 'Partial Refund' }
    };
    const { variant, label } = config[status];
    return <Badge variant={variant} size="sm">{label}</Badge>;
  };

  // Handle order selection
  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const toggleSelectAll = () => {
    if (selectedOrders.length === filteredOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(filteredOrders.map(o => o.id));
    }
  };

  // Update order status
  const updateOrderStatus = (orderId: string, newStatus: FulfillmentStatus) => {
    setOrders(prev => prev.map(order => {
      if (order.id === orderId) {
        const history = [...order.history, {
          status: newStatus,
          timestamp: new Date().toISOString(),
          user: 'Admin'
        }];
        return { ...order, fulfillmentStatus: newStatus, history, updatedAt: new Date().toISOString() };
      }
      return order;
    }));
    showToast({ title: `Order status updated to ${newStatus.replace(/_/g, ' ')}`, type: 'success' });
    setIsStatusModalOpen(false);
  };

  // Bulk update status
  const bulkUpdateStatus = (newStatus: FulfillmentStatus) => {
    setOrders(prev => prev.map(order => {
      if (selectedOrders.includes(order.id)) {
        const history = [...order.history, {
          status: newStatus,
          timestamp: new Date().toISOString(),
          user: 'Admin'
        }];
        return { ...order, fulfillmentStatus: newStatus, history, updatedAt: new Date().toISOString() };
      }
      return order;
    }));
    showToast({ title: `${selectedOrders.length} orders updated to ${newStatus.replace(/_/g, ' ')}`, type: 'success' });
    setSelectedOrders([]);
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Order Number', 'Customer', 'Email', 'Total', 'Status', 'Payment', 'Delivery Date', 'Created'];
    const rows = filteredOrders.map(o => [
      o.orderNumber,
      o.customer.name,
      o.customer.email,
      `£${o.total.toFixed(2)}`,
      o.fulfillmentStatus,
      o.paymentStatus,
      o.deliverySlot.date,
      new Date(o.createdAt).toLocaleDateString()
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `orders-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    showToast({ title: 'Orders exported successfully', type: 'success' });
  };

  // Order counts by status
  const statusCounts = useMemo(() => ({
    all: orders.length,
    new: orders.filter(o => o.fulfillmentStatus === 'new').length,
    confirmed: orders.filter(o => o.fulfillmentStatus === 'confirmed').length,
    preparing: orders.filter(o => o.fulfillmentStatus === 'preparing').length,
    out_for_delivery: orders.filter(o => o.fulfillmentStatus === 'out_for_delivery').length,
    delivered: orders.filter(o => o.fulfillmentStatus === 'delivered').length,
    cancelled: orders.filter(o => o.fulfillmentStatus === 'cancelled').length,
  }), [orders]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Orders</h1>
          <p className={styles.subtitle}>{filteredOrders.length} orders found</p>
        </div>
        <div className={styles.headerActions}>
          <Button variant="outline" leftIcon={<Download size={16} />} onClick={exportToCSV}>
            Export CSV
          </Button>
          <Button variant="outline" leftIcon={<RefreshCw size={16} />} onClick={() => setOrders(mockOrders)}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Status Tabs */}
      <div className={styles.statusTabs}>
        <button 
          className={`${styles.statusTab} ${statusFilter === 'all' ? styles.active : ''}`}
          onClick={() => setStatusFilter('all')}
        >
          All <span className={styles.tabCount}>{statusCounts.all}</span>
        </button>
        <button 
          className={`${styles.statusTab} ${statusFilter === 'new' ? styles.active : ''}`}
          onClick={() => setStatusFilter('new')}
        >
          New <span className={styles.tabCount}>{statusCounts.new}</span>
        </button>
        <button 
          className={`${styles.statusTab} ${statusFilter === 'preparing' ? styles.active : ''}`}
          onClick={() => setStatusFilter('preparing')}
        >
          Preparing <span className={styles.tabCount}>{statusCounts.preparing}</span>
        </button>
        <button 
          className={`${styles.statusTab} ${statusFilter === 'out_for_delivery' ? styles.active : ''}`}
          onClick={() => setStatusFilter('out_for_delivery')}
        >
          Out for Delivery <span className={styles.tabCount}>{statusCounts.out_for_delivery}</span>
        </button>
        <button 
          className={`${styles.statusTab} ${statusFilter === 'delivered' ? styles.active : ''}`}
          onClick={() => setStatusFilter('delivered')}
        >
          Delivered <span className={styles.tabCount}>{statusCounts.delivered}</span>
        </button>
        <button 
          className={`${styles.statusTab} ${statusFilter === 'cancelled' ? styles.active : ''}`}
          onClick={() => setStatusFilter('cancelled')}
        >
          Cancelled <span className={styles.tabCount}>{statusCounts.cancelled}</span>
        </button>
      </div>

      {/* Search and Filters */}
      <Card className={styles.filtersCard}>
        <div className={styles.searchRow}>
          <div className={styles.searchInput}>
            <Search size={18} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Search by order number, customer, or postcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={styles.search}
            />
            {searchQuery && (
              <button className={styles.clearSearch} onClick={() => setSearchQuery('')}>
                <X size={16} />
              </button>
            )}
          </div>
          <Button 
            variant="outline" 
            leftIcon={<Filter size={16} />}
            onClick={() => setShowFilters(!showFilters)}
          >
            Filters
            {(paymentFilter !== 'all' || dateFilter !== 'all') && (
              <span className={styles.filterBadge}>
                {[paymentFilter, dateFilter].filter(f => f !== 'all').length}
              </span>
            )}
          </Button>
          <Select
            value={sortBy}
            onChange={(value) => setSortBy(value)}
            className={styles.sortSelect}
            options={[
              { value: 'newest', label: 'Newest First' },
              { value: 'oldest', label: 'Oldest First' },
              { value: 'total-high', label: 'Total: High to Low' },
              { value: 'total-low', label: 'Total: Low to High' },
              { value: 'delivery', label: 'Delivery Date' },
            ]}
          />
        </div>

        {showFilters && (
          <div className={styles.filtersRow}>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Payment Status</label>
              <Select
                value={paymentFilter}
                onChange={(value) => setPaymentFilter(value)}
                options={[
                  { value: 'all', label: 'All Payments' },
                  { value: 'paid', label: 'Paid' },
                  { value: 'unpaid', label: 'Unpaid' },
                  { value: 'refunded', label: 'Refunded' },
                  { value: 'partially_refunded', label: 'Partially Refunded' },
                ]}
              />
            </div>
            <div className={styles.filterGroup}>
              <label className={styles.filterLabel}>Date Range</label>
              <Select
                value={dateFilter}
                onChange={(value) => setDateFilter(value)}
                options={[
                  { value: 'all', label: 'All Time' },
                  { value: 'today', label: 'Today' },
                  { value: 'week', label: 'Last 7 Days' },
                  { value: 'month', label: 'Last 30 Days' },
                ]}
              />
            </div>
            <Button
              variant="ghost" 
              size="sm"
              onClick={() => {
                setPaymentFilter('all');
                setDateFilter('all');
                setSearchQuery('');
              }}
            >
              Clear Filters
            </Button>
          </div>
        )}
      </Card>

      {/* Bulk Actions */}
      {selectedOrders.length > 0 && (
        <Card className={styles.bulkActions}>
          <div className={styles.bulkContent}>
            <span className={styles.bulkCount}>{selectedOrders.length} orders selected</span>
            <div className={styles.bulkButtons}>
              <Button variant="outline" size="sm" onClick={() => bulkUpdateStatus('confirmed')}>
                Mark Confirmed
              </Button>
              <Button variant="outline" size="sm" onClick={() => bulkUpdateStatus('preparing')}>
                Mark Preparing
              </Button>
              <Button variant="outline" size="sm" onClick={() => bulkUpdateStatus('out_for_delivery')}>
                Mark Out for Delivery
              </Button>
              <Button variant="outline" size="sm" onClick={() => bulkUpdateStatus('delivered')}>
                Mark Delivered
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedOrders([])}>
                Clear Selection
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Orders Table */}
      <Card className={styles.tableCard}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th className={styles.checkboxCol}>
                  <input
                    type="checkbox"
                    checked={selectedOrders.length === filteredOrders.length && filteredOrders.length > 0}
                    onChange={toggleSelectAll}
                    className={styles.checkbox}
                  />
                </th>
                <th>Order</th>
                <th>Customer</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Payment</th>
                <th>Delivery</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={9} className={styles.emptyState}>
                    <div className={styles.emptyContent}>
                      <Package size={48} className={styles.emptyIcon} />
                      <h3>No orders found</h3>
                      <p>Try adjusting your search or filter criteria</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredOrders.map(order => (
                  <tr key={order.id} className={selectedOrders.includes(order.id) ? styles.selectedRow : ''}>
                    <td className={styles.checkboxCol}>
                      <input
                        type="checkbox"
                        checked={selectedOrders.includes(order.id)}
                        onChange={() => toggleOrderSelection(order.id)}
                        className={styles.checkbox}
                      />
                    </td>
                    <td>
                      <div className={styles.orderCell}>
                        <span className={styles.orderNumber}>{order.orderNumber}</span>
                        <span className={styles.orderDate}>
                          {new Date(order.createdAt).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.customerCell}>
                        <span className={styles.customerName}>{order.customer.name}</span>
                        <span className={styles.customerEmail}>{order.customer.email}</span>
                      </div>
                    </td>
                    <td>
                      <span className={styles.itemCount}>
                        {order.items.reduce((sum, item) => sum + item.quantity, 0)} items
                      </span>
                    </td>
                    <td>
                      <span className={styles.total}>£{order.total.toFixed(2)}</span>
                    </td>
                    <td>{getStatusBadge(order.fulfillmentStatus)}</td>
                    <td>{getPaymentBadge(order.paymentStatus)}</td>
                    <td>
                      <div className={styles.deliveryCell}>
                        <span className={styles.deliveryDate}>
                          {new Date(order.deliverySlot.date).toLocaleDateString('en-GB', {
                            day: 'numeric',
                            month: 'short'
                          })}
                        </span>
                        <span className={styles.deliveryTime}>{order.deliverySlot.timeWindow}</span>
                      </div>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button 
                          className={styles.actionBtn}
                          onClick={() => {
                            setSelectedOrder(order);
                            setIsDetailModalOpen(true);
                          }}
                          title="View Details"
                        >
                          <Eye size={16} />
                        </button>
                        <button 
                          className={styles.actionBtn}
                          onClick={() => {
                            setSelectedOrder(order);
                            setIsStatusModalOpen(true);
                          }}
                          title="Update Status"
                        >
                          <Edit size={16} />
                        </button>
                        <button className={styles.actionBtn} title="Print">
                          <Printer size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Order Detail Modal */}
      <Modal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        title={`Order ${selectedOrder?.orderNumber || ''}`}
        size="lg"
      >
        {selectedOrder && (
          <div className={styles.orderDetail}>
            <div className={styles.detailHeader}>
              <div className={styles.detailStatus}>
                {getStatusBadge(selectedOrder.fulfillmentStatus)}
                {getPaymentBadge(selectedOrder.paymentStatus)}
              </div>
              <span className={styles.detailDate}>
                Created: {new Date(selectedOrder.createdAt).toLocaleString('en-GB')}
              </span>
            </div>

            <div className={styles.detailGrid}>
              <div className={styles.detailSection}>
                <h4 className={styles.detailTitle}>Customer</h4>
                <p className={styles.detailText}>{selectedOrder.customer.name}</p>
                <p className={styles.detailText}>{selectedOrder.customer.email}</p>
                <p className={styles.detailText}>{selectedOrder.customer.phone}</p>
              </div>

              <div className={styles.detailSection}>
                <h4 className={styles.detailTitle}>Delivery Address</h4>
                <p className={styles.detailText}>{selectedOrder.deliveryAddress.line1}</p>
                {selectedOrder.deliveryAddress.line2 && (
                  <p className={styles.detailText}>{selectedOrder.deliveryAddress.line2}</p>
                )}
                <p className={styles.detailText}>
                  {selectedOrder.deliveryAddress.city}, {selectedOrder.deliveryAddress.postcode}
                </p>
              </div>

              <div className={styles.detailSection}>
                <h4 className={styles.detailTitle}>Delivery Slot</h4>
                <p className={styles.detailText}>
                  {new Date(selectedOrder.deliverySlot.date).toLocaleDateString('en-GB', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}
                </p>
                <p className={styles.detailText}>{selectedOrder.deliverySlot.timeWindow}</p>
              </div>
            </div>

            <div className={styles.itemsSection}>
              <h4 className={styles.detailTitle}>Order Items</h4>
              <table className={styles.itemsTable}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Variant</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map((item, index) => (
                    <tr key={index}>
                      <td>{item.name}</td>
                      <td>{item.variant || '-'}</td>
                      <td>{item.quantity}</td>
                      <td>£{item.unitPrice.toFixed(2)}</td>
                      <td>£{(item.quantity * item.unitPrice).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className={styles.totalsSection}>
              <div className={styles.totalRow}>
                <span>Subtotal</span>
                <span>£{selectedOrder.subtotal.toFixed(2)}</span>
              </div>
              <div className={styles.totalRow}>
                <span>Delivery Fee</span>
                <span>£{selectedOrder.deliveryFee.toFixed(2)}</span>
              </div>
              {selectedOrder.discount > 0 && (
                <div className={styles.totalRow}>
                  <span>Discount</span>
                  <span className={styles.discount}>-£{selectedOrder.discount.toFixed(2)}</span>
                </div>
              )}
              <div className={`${styles.totalRow} ${styles.grandTotal}`}>
                <span>Total</span>
                <span>£{selectedOrder.total.toFixed(2)}</span>
              </div>
            </div>

            {(selectedOrder.customerNotes || selectedOrder.internalNotes) && (
              <div className={styles.notesSection}>
                {selectedOrder.customerNotes && (
                  <div className={styles.noteBox}>
                    <h5>Customer Notes</h5>
                    <p>{selectedOrder.customerNotes}</p>
                  </div>
                )}
                {selectedOrder.internalNotes && (
                  <div className={`${styles.noteBox} ${styles.internalNote}`}>
                    <h5>Internal Notes</h5>
                    <p>{selectedOrder.internalNotes}</p>
                  </div>
                )}
              </div>
            )}

            <div className={styles.historySection}>
              <h4 className={styles.detailTitle}>Order Timeline</h4>
              <div className={styles.timeline}>
                {selectedOrder.history.map((entry, index) => (
                  <div key={index} className={styles.timelineItem}>
                    <div className={styles.timelineDot} />
                    <div className={styles.timelineContent}>
                      <span className={styles.timelineStatus}>
                        {entry.status.replace(/_/g, ' ')}
                      </span>
                      <span className={styles.timelineMeta}>
                        {new Date(entry.timestamp).toLocaleString('en-GB')} • {entry.user}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <ModalFooter>
          <Button variant="outline" onClick={() => setIsDetailModalOpen(false)}>
            Close
          </Button>
          <Button 
            variant="primary" 
            onClick={() => {
              setIsDetailModalOpen(false);
              setIsStatusModalOpen(true);
            }}
          >
            Update Status
          </Button>
        </ModalFooter>
      </Modal>

      {/* Update Status Modal */}
      <Modal
        isOpen={isStatusModalOpen}
        onClose={() => setIsStatusModalOpen(false)}
        title="Update Order Status"
        size="sm"
      >
        {selectedOrder && (
          <div className={styles.statusModal}>
            <p className={styles.statusModalText}>
              Update status for order <strong>{selectedOrder.orderNumber}</strong>
            </p>
            <p className={styles.statusModalCurrent}>
              Current status: {getStatusBadge(selectedOrder.fulfillmentStatus)}
            </p>
            <div className={styles.statusOptions}>
              {(['new', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'] as FulfillmentStatus[]).map(status => (
                <button
                  key={status}
                  className={`${styles.statusOption} ${selectedOrder.fulfillmentStatus === status ? styles.current : ''}`}
                  onClick={() => updateOrderStatus(selectedOrder.id, status)}
                  disabled={selectedOrder.fulfillmentStatus === status}
                >
                  {status === 'new' && <Clock size={18} />}
                  {status === 'confirmed' && <CheckCircle size={18} />}
                  {status === 'preparing' && <Package size={18} />}
                  {status === 'out_for_delivery' && <Truck size={18} />}
                  {status === 'delivered' && <CheckCircle size={18} />}
                  {status === 'cancelled' && <X size={18} />}
                  <span>{status.replace(/_/g, ' ')}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default Orders;
