import React, { useState, useMemo } from 'react';
import { Users, Search, Eye, Mail, Phone, MapPin, ShoppingBag, Download, Edit2, X, Save } from 'lucide-react';
import { 
  Button, Card, Badge, Input, Modal, ModalFooter, 
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
  FormGrid, FormRow, FormValue, FormSection,
  PageToolbar, ToolbarStart, ToolbarEnd, TagFilters
} from '../components/common';
import { useToast } from '../components/common/Toast';
import { customers as initialCustomers, orders, Customer } from '../data/mockData';
import styles from './Customers.module.css';

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

const formatCurrency = (amount: number) => `£${amount.toFixed(2)}`;

const Customers: React.FC = () => {
  const { showToast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string>('All');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Customer>>({});

  // Get all unique tags
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    customers.forEach(c => c.tags.forEach(t => tags.add(t)));
    return ['All', ...Array.from(tags)];
  }, [customers]);

  // Calculate stats
  const stats = useMemo(() => {
    const total = customers.length;
    const vip = customers.filter(c => c.tags.includes('VIP')).length;
    const withMarketing = customers.filter(c => c.marketingOptIn).length;
    const totalRevenue = customers.reduce((sum, c) => sum + c.totalSpent, 0);
    return { total, vip, withMarketing, totalRevenue };
  }, [customers]);

  // Get customer orders
  const getCustomerOrders = (customerId: string) => {
    return orders.filter(o => o.customer.id === customerId);
  };

  // Filter customers
  const filteredCustomers = useMemo(() => {
    return customers.filter(customer => {
      const matchesSearch = 
        customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        customer.phone.includes(searchQuery) ||
        customer.addresses.some(a => a.postcode.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesTag = selectedTag === 'All' || customer.tags.includes(selectedTag);
      return matchesSearch && matchesTag;
    });
  }, [customers, searchQuery, selectedTag]);

  const handleViewCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsViewModalOpen(true);
  };

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setEditForm({
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      marketingOptIn: customer.marketingOptIn,
      tags: [...customer.tags],
      notes: customer.notes
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedCustomer) return;
    setCustomers(prev => prev.map(c => 
      c.id === selectedCustomer.id 
        ? { ...c, ...editForm }
        : c
    ));
    showToast({ type: 'success', title: 'Customer updated successfully' });
    setIsEditModalOpen(false);
    setSelectedCustomer(null);
  };

  const handleAddTag = (tag: string) => {
    if (!tag.trim()) return;
    setEditForm(prev => ({
      ...prev,
      tags: [...(prev.tags || []), tag.trim()]
    }));
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setEditForm(prev => ({
      ...prev,
      tags: (prev.tags || []).filter(t => t !== tagToRemove)
    }));
  };

  const handleExportCustomers = () => {
    const headers = ['Name', 'Email', 'Phone', 'Postcode', 'Orders', 'Total Spent', 'Tags', 'Marketing'];
    const rows = filteredCustomers.map(c => [
      c.name,
      c.email,
      c.phone,
      c.addresses[0]?.postcode || '',
      c.orderCount.toString(),
      formatCurrency(c.totalSpent),
      c.tags.join('; '),
      c.marketingOptIn ? 'Yes' : 'No'
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    showToast({ type: 'success', title: `Exported ${filteredCustomers.length} customers` });
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleSection}>
          <Users size={28} />
          <div>
            <h1 className={styles.title}>Customers</h1>
            <p className={styles.subtitle}>Manage your customer database</p>
          </div>
        </div>
        <Button variant="outline" onClick={handleExportCustomers}>
          <Download size={18} />
          Export CSV
        </Button>
      </div>

      {/* Stats Cards */}
      <div className={styles.statsGrid}>
        <Card className={styles.statCard}>
          <span className={styles.statLabel}>Total Customers</span>
          <span className={styles.statValue}>{stats.total}</span>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statLabel}>VIP Customers</span>
          <span className={`${styles.statValue} ${styles.vip}`}>{stats.vip}</span>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statLabel}>Marketing Opt-In</span>
          <span className={`${styles.statValue} ${styles.marketing}`}>{stats.withMarketing}</span>
        </Card>
        <Card className={styles.statCard}>
          <span className={styles.statLabel}>Total Revenue</span>
          <span className={`${styles.statValue} ${styles.revenue}`}>{formatCurrency(stats.totalRevenue)}</span>
        </Card>
      </div>

      {/* Filters - Using PageToolbar */}
      <Card className={styles.filtersCard}>
        <PageToolbar>
          <ToolbarStart>
            <Input
              placeholder="Search by name, email, phone, or postcode..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              leftIcon={<Search size={18} />}
              className={styles.searchInput}
            />
            <TagFilters
              tags={allTags}
              selectedTag={selectedTag}
              onTagSelect={setSelectedTag}
            />
          </ToolbarStart>
        </PageToolbar>
      </Card>

      {/* Customers Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Orders</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>Last Order</TableHead>
              <TableHead>Marketing</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCustomers.map(customer => (
              <TableRow key={customer.id}>
                <TableCell>
                  <div className={styles.customerCell}>
                    <div className={styles.avatar}>
                      {customer.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className={styles.customerInfo}>
                      <span className={styles.customerName}>{customer.name}</span>
                      <span className={styles.customerEmail}>{customer.email}</span>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className={styles.contactCell}>
                    <span><Phone size={14} /> {customer.phone}</span>
                    <span><MapPin size={14} /> {customer.addresses[0]?.postcode || 'N/A'}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className={styles.ordersCell}>
                    <span className={styles.orderCount}>{customer.orderCount}</span>
                    <span className={styles.orderTotal}>{formatCurrency(customer.totalSpent)}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className={styles.tagsCell}>
                    {customer.tags.length > 0 ? (
                      customer.tags.map((tag, i) => (
                        <Badge key={i} variant={tag === 'VIP' ? 'success' : 'info'} size="sm">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <span className={styles.noTags}>—</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <span className={styles.lastOrder}>
                    {customer.lastOrderAt ? formatDate(customer.lastOrderAt) : 'Never'}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant={customer.marketingOptIn ? 'success' : 'default'} size="sm">
                    {customer.marketingOptIn ? 'Opted In' : 'Opted Out'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className={styles.actions}>
                    <Button variant="ghost" size="sm" onClick={() => handleViewCustomer(customer)}>
                      <Eye size={16} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleEditCustomer(customer)}>
                      <Edit2 size={16} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filteredCustomers.length === 0 && (
          <div className={styles.emptyState}>
            <Users size={48} />
            <p>No customers found</p>
          </div>
        )}
      </Card>

      {/* View Customer Modal */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Customer Details"
        size="lg"
      >
        {selectedCustomer && (
          <div className={styles.customerDetail}>
            <div className={styles.detailHeader}>
              <div className={styles.avatarLarge}>
                {selectedCustomer.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className={styles.detailInfo}>
                <h2>{selectedCustomer.name}</h2>
                <div className={styles.detailMeta}>
                  {selectedCustomer.tags.map((tag, i) => (
                    <Badge key={i} variant={tag === 'VIP' ? 'success' : 'info'}>{tag}</Badge>
                  ))}
                  <Badge variant={selectedCustomer.marketingOptIn ? 'success' : 'default'}>
                    {selectedCustomer.marketingOptIn ? 'Marketing Opted In' : 'Marketing Opted Out'}
                  </Badge>
                </div>
              </div>
            </div>

            <div className={styles.detailGrid}>
              <div className={styles.detailSection}>
                <h3>Contact Information</h3>
                <div className={styles.contactInfo}>
                  <p><Mail size={16} /> {selectedCustomer.email}</p>
                  <p><Phone size={16} /> {selectedCustomer.phone}</p>
                </div>
              </div>
              <div className={styles.detailSection}>
                <h3>Addresses</h3>
                {selectedCustomer.addresses.map(addr => (
                  <div key={addr.id} className={styles.addressCard}>
                    <MapPin size={16} />
                    <div>
                      <p>{addr.line1}</p>
                      {addr.line2 && <p>{addr.line2}</p>}
                      <p>{addr.city}, {addr.postcode}</p>
                      {addr.isDefault && <Badge size="sm" variant="info">Default</Badge>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className={styles.detailSection}>
              <h3>Purchase Summary</h3>
              <div className={styles.purchaseSummary}>
                <div className={styles.summaryItem}>
                  <ShoppingBag size={20} />
                  <div>
                    <span className={styles.summaryValue}>{selectedCustomer.orderCount}</span>
                    <span className={styles.summaryLabel}>Total Orders</span>
                  </div>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.currencyIcon}>£</span>
                  <div>
                    <span className={styles.summaryValue}>{formatCurrency(selectedCustomer.totalSpent)}</span>
                    <span className={styles.summaryLabel}>Total Spent</span>
                  </div>
                </div>
                <div className={styles.summaryItem}>
                  <span className={styles.currencyIcon}>Ø</span>
                  <div>
                    <span className={styles.summaryValue}>
                      {selectedCustomer.orderCount > 0 
                        ? formatCurrency(selectedCustomer.totalSpent / selectedCustomer.orderCount) 
                        : '£0.00'}
                    </span>
                    <span className={styles.summaryLabel}>Avg Order Value</span>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.detailSection}>
              <h3>Order History</h3>
              <div className={styles.orderHistory}>
                {getCustomerOrders(selectedCustomer.id).length > 0 ? (
                  getCustomerOrders(selectedCustomer.id).map(order => (
                    <div key={order.id} className={styles.orderHistoryItem}>
                      <div className={styles.orderHistoryMain}>
                        <span className={styles.orderNumber}>{order.orderNumber}</span>
                        <span className={styles.orderDate}>{formatDate(order.createdAt)}</span>
                      </div>
                      <div className={styles.orderHistoryMeta}>
                        <Badge variant={order.fulfillmentStatus === 'delivered' ? 'success' : 'info'} size="sm">
                          {order.fulfillmentStatus}
                        </Badge>
                        <span className={styles.orderAmount}>{formatCurrency(order.total)}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className={styles.noOrders}>No orders found</p>
                )}
              </div>
            </div>

            {selectedCustomer.notes && (
              <div className={styles.detailSection}>
                <h3>Notes</h3>
                <p className={styles.customerNotes}>{selectedCustomer.notes}</p>
              </div>
            )}

            <div className={styles.detailSection}>
              <h3>Account Info</h3>
              <p className={styles.accountInfo}>
                Customer since: <strong>{formatDate(selectedCustomer.createdAt)}</strong>
              </p>
              {selectedCustomer.lastOrderAt && (
                <p className={styles.accountInfo}>
                  Last order: <strong>{formatDate(selectedCustomer.lastOrderAt)}</strong>
                </p>
              )}
            </div>
          </div>
        )}
        <ModalFooter>
          <Button variant="outline" onClick={() => setIsViewModalOpen(false)}>Close</Button>
          <Button onClick={() => { setIsViewModalOpen(false); handleEditCustomer(selectedCustomer!); }}>
            <Edit2 size={16} /> Edit Customer
          </Button>
        </ModalFooter>
      </Modal>

      {/* Edit Customer Modal - Using FormGrid */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Customer"
        size="md"
      >
        <FormGrid>
          <FormRow label="Full Name" htmlFor="edit-name">
            <input
              id="edit-name"
              type="text"
              value={editForm.name || ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
            />
          </FormRow>
          <FormRow label="Email Address" htmlFor="edit-email">
            <input
              id="edit-email"
              type="email"
              value={editForm.email || ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
            />
          </FormRow>
          <FormRow label="Phone Number" htmlFor="edit-phone">
            <input
              id="edit-phone"
              type="tel"
              value={editForm.phone || ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
            />
          </FormRow>
          
          <FormSection title="Tags">
            <div className={styles.tagsEditor}>
              {(editForm.tags || []).map((tag, i) => (
                <span key={i} className={styles.tagChip}>
                  {tag}
                  <button onClick={() => handleRemoveTag(tag)} className={styles.tagRemove}>
                    <X size={12} />
                  </button>
                </span>
              ))}
              <input
                type="text"
                placeholder="Add tag..."
                className={styles.tagInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTag((e.target as HTMLInputElement).value);
                    (e.target as HTMLInputElement).value = '';
                  }
                }}
              />
            </div>
            <p className={styles.formHint}>Press Enter to add a tag</p>
          </FormSection>

          <FormRow label="Marketing" htmlFor="edit-marketing">
            <label className={styles.checkboxLabel}>
              <input
                id="edit-marketing"
                type="checkbox"
                checked={editForm.marketingOptIn || false}
                onChange={(e) => setEditForm(prev => ({ ...prev, marketingOptIn: e.target.checked }))}
              />
              Opted in to marketing emails
            </label>
          </FormRow>

          <FormRow label="Notes" htmlFor="edit-notes">
            <textarea
              id="edit-notes"
              className={styles.notesTextarea}
              value={editForm.notes || ''}
              onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Add notes about this customer..."
              rows={3}
            />
          </FormRow>
        </FormGrid>
        <ModalFooter>
          <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSaveEdit}>
            <Save size={16} /> Save Changes
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
};

export default Customers;
