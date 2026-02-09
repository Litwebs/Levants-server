// useOrders.ts

import { useState, useMemo } from 'react';
import {
  orders as mockOrders,
  Order,
  FulfillmentStatus,
  PaymentStatus,
} from './mockData';
import { useToast } from '../../components/common/Toast';

export const useOrders = () => {
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

  const filteredOrders = useMemo(() => {
    let result = [...orders];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(o =>
        o.orderNumber.toLowerCase().includes(q) ||
        o.customer.name.toLowerCase().includes(q) ||
        o.customer.email.toLowerCase().includes(q) ||
        o.deliveryAddress.postcode.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter(o => o.fulfillmentStatus === statusFilter);
    }

    if (paymentFilter !== 'all') {
      result = result.filter(o => o.paymentStatus === paymentFilter);
    }

    if (dateFilter !== 'all') {
      const now = new Date();
      result = result.filter(o => {
        const d = new Date(o.createdAt);
        if (dateFilter === 'today') {
          return o.createdAt.startsWith(now.toISOString().split('T')[0]);
        }
        if (dateFilter === 'week') {
          return d >= new Date(now.getTime() - 7 * 86400000);
        }
        if (dateFilter === 'month') {
          return d >= new Date(now.getTime() - 30 * 86400000);
        }
        return true;
      });
    }

    result.sort((a, b) => {
      if (sortBy === 'newest') return +new Date(b.createdAt) - +new Date(a.createdAt);
      if (sortBy === 'oldest') return +new Date(a.createdAt) - +new Date(b.createdAt);
      if (sortBy === 'total-high') return b.total - a.total;
      if (sortBy === 'total-low') return a.total - b.total;
      if (sortBy === 'delivery') return +new Date(a.deliverySlot.date) - +new Date(b.deliverySlot.date);
      return 0;
    });

    return result;
  }, [orders, searchQuery, statusFilter, paymentFilter, dateFilter, sortBy]);

  const statusCounts = useMemo<Record<string, number>>(() => ({
    all: orders.length,
    new: orders.filter(o => o.fulfillmentStatus === 'new').length,
    confirmed: orders.filter(o => o.fulfillmentStatus === 'confirmed').length,
    preparing: orders.filter(o => o.fulfillmentStatus === 'preparing').length,
    out_for_delivery: orders.filter(o => o.fulfillmentStatus === 'out_for_delivery').length,
    delivered: orders.filter(o => o.fulfillmentStatus === 'delivered').length,
    cancelled: orders.filter(o => o.fulfillmentStatus === 'cancelled').length,
  }), [orders]);

  const toggleOrderSelection = (id: string) => {
    setSelectedOrders(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    setSelectedOrders(prev =>
      prev.length === filteredOrders.length ? [] : filteredOrders.map(o => o.id)
    );
  };

  const updateOrderStatus = (id: string, status: FulfillmentStatus) => {
    setOrders(prev =>
      prev.map(o =>
        o.id === id
          ? {
              ...o,
              fulfillmentStatus: status,
              history: [
                ...o.history,
                {
                  status,
                  timestamp: new Date().toISOString(),
                  user: 'Admin',
                },
              ],
              updatedAt: new Date().toISOString(),
            }
          : o
      )
    );
    showToast({ title: 'Order status updated', type: 'success' });
    setIsStatusModalOpen(false);
  };

  const bulkUpdateStatus = (status: FulfillmentStatus) => {
    setOrders(prev =>
      prev.map(o =>
        selectedOrders.includes(o.id)
          ? {
              ...o,
              fulfillmentStatus: status,
              history: [
                ...o.history,
                {
                  status,
                  timestamp: new Date().toISOString(),
                  user: 'Admin',
                },
              ],
              updatedAt: new Date().toISOString(),
            }
          : o
      )
    );
    showToast({ title: `${selectedOrders.length} orders updated`, type: 'success' });
    setSelectedOrders([]);
  };

  const exportToCSV = () => {
    const rows = filteredOrders.map(o =>
      `${o.orderNumber},${o.customer.name},${o.customer.email},£${o.total}`
    );
    const csv = ['Order,Customer,Email,Total', ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), {
      href: url,
      download: 'orders.csv',
    }).click();
    showToast({ title: 'Orders exported', type: 'success' });
  };

  return {
    orders,
    setOrders,

    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    paymentFilter,
    setPaymentFilter,
    dateFilter,
    setDateFilter,
    sortBy,
    setSortBy,

    selectedOrders,
    setSelectedOrders,
    selectedOrder,
    setSelectedOrder,

    isDetailModalOpen,
    setIsDetailModalOpen,
    isStatusModalOpen,
    setIsStatusModalOpen,
    showFilters,
    setShowFilters,

    filteredOrders,
    statusCounts,

    toggleOrderSelection,
    toggleSelectAll,
    updateOrderStatus,
    bulkUpdateStatus,
    exportToCSV,
  };
};
