import { ChevronRight, Mail, MapPin, Phone } from "lucide-react";
import { DataTableCard, Button, Badge, Table } from "../../components/common";
import styles from "./Customers.module.css";
import sharedTableStyles from "../../components/common/DataTableCard/DataTableCard.module.css";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { Customer, CustomersListMeta } from "../../context/Customers";

type CustomersTableProps = {
  filteredCustomers: Customer[];
  loading: boolean;
  page: number;
  setPage: (page: number | ((previous: number) => number)) => void;
  pageSize: number;
  setPageSize: (pageSize: number) => void;
  meta: CustomersListMeta | null;
  searchQuery: string;
  customerTypeFilter: "all" | "guest" | "registered";
};

const CustomersTable = ({
  filteredCustomers,
  loading,
  page,
  setPage,
  pageSize,
  setPageSize,
  meta,
  searchQuery,
  customerTypeFilter,
}: CustomersTableProps) => {
  const navigate = useNavigate();
  const total = meta?.total ?? filteredCustomers?.length ?? 0;
  const totalPages = meta?.totalPages ?? 1;

  const getFullName = (c: Customer) =>
    `${c?.firstName || ""} ${c?.lastName || ""}`.trim() || c?.email;

  const getDefaultAddress = (c: Customer) => {
    const addresses = Array.isArray(c?.addresses) ? c.addresses : [];
    return addresses.find((address) => address?.isDefault) || addresses[0] || null;
  };

  const formatLastOrder = (value: unknown) => {
    if (!value) return "Never";
    const d = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);
  };

  const pageSizeOptions = useMemo(
    () => [
      { value: "10", label: "10 / page" },
      { value: "25", label: "25 / page" },
      { value: "50", label: "50 / page" },
      { value: "100", label: "100 / page" },
    ],
    [],
  );

  return (
    <DataTableCard
      className={styles.tableCard}
      loading={loading}
      loadingText="Loading..."
      pagination={{
        page,
        pageSize,
        total,
        totalPages,
        setPage,
        setPageSize,
        pageSizeOptions,
        loading,
      }}
    >
      <Table withWrapper={false} tableClassName={sharedTableStyles.table}>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Contact</th>
            <th>Last Order</th>
            <th>Account Type</th>
            <th><span className={styles.srOnly}>Actions</span></th>
          </tr>
        </thead>

        <tbody>
          {(filteredCustomers?.length ?? 0) === 0 ? (
            <tr className={sharedTableStyles.emptyStateRow}>
              <td className={sharedTableStyles.emptyTableCell} colSpan={5}>
                {loading
                  ? "Loading customers…"
                  : searchQuery || customerTypeFilter !== "all"
                    ? "No customers match your search or filters."
                    : "No customers yet."}
              </td>
            </tr>
          ) : (
            filteredCustomers.map((c) => {
              const addr = getDefaultAddress(c);
              return (
                <tr
                  key={c._id}
                  className={styles.clickableRow}
                  onClick={() => navigate(`/customers/${c._id}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(`/customers/${c._id}`);
                    }
                  }}
                  tabIndex={0}
                  aria-label={`View ${getFullName(c)}`}
                >
                  <td>
                    <div className={styles.customerCell}>
                      <span className={styles.avatar} aria-hidden="true">
                        {(c.firstName?.[0] || c.email?.[0] || "C").toUpperCase()}
                        {(c.lastName?.[0] || "").toUpperCase()}
                      </span>
                      <span className={styles.customerInfo}>
                        <strong className={styles.customerName}>{getFullName(c)}</strong>
                        <span className={styles.customerEmail}><Mail size={13} /> {c.email}</span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <div className={styles.contactCell}>
                      <span>
                        <Phone size={14} /> {c.phone || "—"}
                      </span>
                      <span>
                        <MapPin size={14} /> {addr?.postcode || "—"}
                      </span>
                    </div>
                  </td>
                  <td>{formatLastOrder(c.lastOrderAt)}</td>
                  <td>
                    <div className={styles.accountBadges}>
                      <Badge variant={c.isGuest ? "default" : "success"}>
                        {c.isGuest ? "Guest" : "Registered"}
                      </Badge>
                      {c.status === "disabled" && <Badge variant="error">Disabled</Badge>}
                    </div>
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/customers/${c._id}`);
                      }}
                      aria-label={`Open ${getFullName(c)}`}
                      className={styles.rowChevron}
                    >
                      <ChevronRight size={17} />
                    </Button>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </Table>
    </DataTableCard>
  );
};

export default CustomersTable;
