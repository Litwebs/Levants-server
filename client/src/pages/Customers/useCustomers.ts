import { useCallback, useEffect, useMemo, useState } from "react";
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
    createCustomerOnboardingLink,
  } = useCustomersContext();

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<
    "newest" | "oldest" | "name-asc" | "name-desc"
  >("newest");
  const [customerTypeFilter, setCustomerTypeFilter] = useState<
    "all" | "guest" | "registered"
  >("all");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [isCreateInviteModalOpen, setIsCreateInviteModalOpen] = useState(false);
  const [createInviteLoading, setCreateInviteLoading] = useState(false);
  const [createdOnboardingLink, setCreatedOnboardingLink] = useState("");
  const [createdOnboardingLinkExpiresAt, setCreatedOnboardingLinkExpiresAt] =
    useState<string | null>(null);
  const [createInviteForm, setCreateInviteForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });

  const refreshCustomers = useCallback(
    () =>
      listCustomers({
        page,
        pageSize,
        search: searchQuery.trim() || undefined,
        type: customerTypeFilter,
        sort: sortBy,
      }),
    [customerTypeFilter, listCustomers, page, pageSize, searchQuery, sortBy],
  );

  useEffect(() => {
    const handle = window.setTimeout(() => {
      refreshCustomers().catch(() => {
        // Error state is tracked in context and rendered by the page.
      });
    }, 250);

    return () => window.clearTimeout(handle);
  }, [refreshCustomers]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, customerTypeFilter, sortBy]);

  const stats = useMemo(() => {
    const summary = meta?.summary;
    return {
      total: summary?.totalCustomers ?? meta?.total ?? customers.length,
      registered: summary?.registeredCustomers ?? 0,
      guests: summary?.guestCustomers ?? 0,
    };
  }, [customers.length, meta]);

  const filteredCustomers = customers;

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
    URL.revokeObjectURL(url);

    showToast({ type: "success", title: "Customers exported" });
  };

  const openCreateInviteModal = () => {
    setCreateInviteForm({ firstName: "", lastName: "", email: "", phone: "" });
    setCreatedOnboardingLink("");
    setCreatedOnboardingLinkExpiresAt(null);
    setIsCreateInviteModalOpen(true);
  };

  const closeCreateInviteModal = () => {
    setIsCreateInviteModalOpen(false);
    setCreateInviteLoading(false);
  };

  const setCreateInviteField = (
    key: "firstName" | "lastName" | "email" | "phone",
    value: string,
  ) => {
    setCreateInviteForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreateInvite = async () => {
    const firstName = createInviteForm.firstName.trim();
    const lastName = createInviteForm.lastName.trim();
    const email = createInviteForm.email.trim().toLowerCase();
    const phone = createInviteForm.phone.trim();

    if (!firstName || !lastName || !email) {
      showToast({
        type: "error",
        title: "Missing details",
        message: "First name, last name, and email are required.",
      });
      return;
    }

    try {
      setCreateInviteLoading(true);
      const result = await createCustomerOnboardingLink({
        firstName,
        lastName,
        email,
        ...(phone ? { phone } : {}),
      });

      setCreatedOnboardingLink(result.onboardingLink);
      setCreatedOnboardingLinkExpiresAt(result.expiresAt);

      showToast({
        type: "success",
        title: "Onboarding link created",
        message: "You can now copy and share the link with the customer.",
      });

      await refreshCustomers();
    } catch (e: any) {
      showToast({
        type: "error",
        title: "Failed to create link",
        message: e?.response?.data?.message || e?.message || "Request failed",
      });
    } finally {
      setCreateInviteLoading(false);
    }
  };

  const copyOnboardingLink = async () => {
    if (!createdOnboardingLink) return;
    try {
      await navigator.clipboard.writeText(createdOnboardingLink);
      showToast({ type: "success", title: "Link copied" });
    } catch {
      showToast({
        type: "error",
        title: "Copy failed",
        message: "Please copy the link manually.",
      });
    }
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
    refreshCustomers,

    searchQuery,
    setSearchQuery,
    sortBy,
    setSortBy,
    customerTypeFilter,
    setCustomerTypeFilter,

    isCreateInviteModalOpen,
    setIsCreateInviteModalOpen,
    createInviteLoading,
    createInviteForm,
    setCreateInviteForm,
    createdOnboardingLink,
    createdOnboardingLinkExpiresAt,

    openCreateInviteModal,
    closeCreateInviteModal,
    setCreateInviteField,
    handleCreateInvite,
    copyOnboardingLink,
    exportCustomers,
  };
};
