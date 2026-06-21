import { useEffect, useMemo, useState } from "react";
import { useToast } from "../../components/common/Toast";
import { useCustomers as useCustomersContext } from "../../context/Customers";
import type { Customer } from "../../context/Customers";

const getDefaultAddress = (customer: Customer) => {
  const addresses = Array.isArray(customer.addresses) ? customer.addresses : [];
  return (
    addresses.find((a) => a?.isDefault) ||
    (addresses.length > 0 ? addresses[0] : null)
  );
};

const getFullName = (customer: Customer) =>
  `${customer.firstName || ""} ${customer.lastName || ""}`.trim();

export const useCustomers = () => {
  const { showToast } = useToast();

  const {
    customers,
    meta,
    loading,
    error,
    listCustomers,
    listCustomerOrders,
    updateCustomer,
  } = useCustomersContext();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [customerTypeFilter, setCustomerTypeFilter] = useState("all");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [editForm, setEditForm] = useState<{
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    address?: {
      line1?: string;
      line2?: string | null;
      city?: string;
      postcode?: string;
      country?: string;
    };
  }>({});

  useEffect(() => {
    const handle = window.setTimeout(() => {
      listCustomers({ page, pageSize, search: searchQuery || undefined }).catch(
        () => {
          // error state is tracked in context
        },
      );
    }, 250);

    return () => window.clearTimeout(handle);
  }, [listCustomers, page, pageSize, searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, customerTypeFilter, sortBy]);

  const stats = useMemo(() => {
    const total = meta?.total ?? customers.length;
    return { total, withMarketing: 0, totalRevenue: 0 };
  }, [customers.length, meta?.total]);

  const filteredCustomers = useMemo(() => {
    const byType = customers.filter((customer) => {
      if (customerTypeFilter === "all") return true;
      if (customerTypeFilter === "guest") return Boolean(customer.isGuest);
      if (customerTypeFilter === "customer") return !customer.isGuest;
      return true;
    });

    const sorted = [...byType];
    switch (sortBy) {
      case "oldest":
        sorted.sort((a, b) => {
          const at = new Date(a.createdAt || 0).getTime();
          const bt = new Date(b.createdAt || 0).getTime();
          return at - bt;
        });
        break;
      case "name-asc":
        sorted.sort((a, b) => getFullName(a).localeCompare(getFullName(b)));
        break;
      case "name-desc":
        sorted.sort((a, b) => getFullName(b).localeCompare(getFullName(a)));
        break;
      case "newest":
      default:
        sorted.sort((a, b) => {
          const at = new Date(a.createdAt || 0).getTime();
          const bt = new Date(b.createdAt || 0).getTime();
          return bt - at;
        });
        break;
    }

    return sorted;
  }, [customers, customerTypeFilter, sortBy]);

  const getCustomerOrders = (_customerId: string) => [];

  const handleViewCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsViewModalOpen(true);
  };

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    const addr = getDefaultAddress(customer);
    setEditForm({
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone ?? "",
      address: {
        line1: addr?.line1 ?? "",
        line2: addr?.line2 ?? "",
        city: addr?.city ?? "",
        postcode: addr?.postcode ?? "",
        country: addr?.country ?? "",
      },
    });
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedCustomer) return;

    const address = editForm.address;
    const hasAnyAddressField =
      !!address?.line1 ||
      !!address?.line2 ||
      !!address?.city ||
      !!address?.postcode ||
      !!address?.country;

    const payload: any = {
      firstName: editForm.firstName,
      lastName: editForm.lastName,
      phone: editForm.phone,
      ...(hasAnyAddressField
        ? {
            address: {
              line1: address?.line1,
              line2: address?.line2 || null,
              city: address?.city,
              postcode: address?.postcode,
              country: address?.country,
            },
          }
        : {}),
    };

    try {
      await updateCustomer(selectedCustomer._id, payload);
      showToast({ type: "success", title: "Customer updated successfully" });
      setIsEditModalOpen(false);
      setSelectedCustomer(null);
    } catch (e: any) {
      showToast({
        type: "error",
        title: "Failed to update customer",
        message: e?.response?.data?.message || error || "Request failed",
      });
    }
  };

  const exportCustomers = () => {
    const rows = filteredCustomers.map((c) => {
      const addr = getDefaultAddress(c);
      return [
        getFullName(c),
        c.email,
        c.phone || "",
        addr?.city || "",
        addr?.postcode || "",
        addr?.country || "",
      ]
        .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
        .join(",");
    });
    const csv = ["Name,Email,Phone,City,Postcode,Country", ...rows].join("\n");

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

    loading,
    error,
    page,
    setPage,
    pageSize,
    setPageSize,
    meta,

    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    customerTypeFilter,
    setCustomerTypeFilter,

    selectedCustomer,
    isViewModalOpen,
    setIsViewModalOpen,

    isEditModalOpen,
    setIsEditModalOpen,

    editForm,
    setEditForm,

    getCustomerOrders,
    listCustomerOrders,
    handleViewCustomer,
    handleEditCustomer,
    handleSaveEdit,
    exportCustomers,
  };
};
