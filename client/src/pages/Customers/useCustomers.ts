import { useState, useMemo } from "react";
import { useToast } from "../../components/common/Toast";
import { customers as initialCustomers, orders, Customer } from "./mockData";

export const useCustomers = () => {
  const { showToast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>(initialCustomers);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Customer>>({});

  const stats = useMemo(() => {
    const total = customers.length;
    const withMarketing = customers.filter(c => c.marketingOptIn).length;
    const totalRevenue = customers.reduce((s, c) => s + c.totalSpent, 0);
    return { total, withMarketing, totalRevenue };
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    return customers.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.phone.includes(searchQuery) ||
      c.addresses.some(a =>
        a.postcode.toLowerCase().includes(searchQuery.toLowerCase())
      )
    );
  }, [customers, searchQuery]);

  const getCustomerOrders = (customerId: string) =>
    orders.filter(o => o.customer.id === customerId);

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
      notes: customer.notes,
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = () => {
    if (!selectedCustomer) return;

    setCustomers(prev =>
      prev.map(c =>
        c.id === selectedCustomer.id ? { ...c, ...editForm } : c
      )
    );

    showToast({ type: "success", title: "Customer updated successfully" });
    setIsEditModalOpen(false);
    setSelectedCustomer(null);
  };

  const exportCustomers = () => {
    const rows = filteredCustomers.map(c =>
      `"${c.name}","${c.email}","${c.phone}","${c.totalSpent}"`
    );
    const csv = ["Name,Email,Phone,Total", ...rows].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    Object.assign(document.createElement("a"), {
      href: url,
      download: "customers.csv",
    }).click();

    showToast({ type: "success", title: "Customers exported" });
  };

  return {
    customers,
    filteredCustomers,
    stats,

    searchQuery,
    setSearchQuery,

    selectedCustomer,
    isViewModalOpen,
    setIsViewModalOpen,

    isEditModalOpen,
    setIsEditModalOpen,

    editForm,
    setEditForm,

    getCustomerOrders,
    handleViewCustomer,
    handleEditCustomer,
    handleSaveEdit,
    exportCustomers,
  };
};
