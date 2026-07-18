import { Eye, Phone, MapPin } from "lucide-react";
import { DataTableCard, Button, Badge, Table } from "../../components/common";
import styles from "./Customers.module.css";
import sharedTableStyles from "../../components/common/DataTableCard/DataTableCard.module.css";
import { useMemo } from "react";

const CustomersTable = ({
  filteredCustomers,
  handleViewCustomer,
  loading,
  page,
  setPage,
  pageSize,
  setPageSize,
  meta,
}: any) => {
  const total = meta?.total ?? filteredCustomers?.length ?? 0;
  const totalPages = meta?.totalPages ?? 1;

  const getFullName = (c: any) =>
    `${c?.firstName || ""} ${c?.lastName || ""}`.trim() || c?.email;

  const getDefaultAddress = (c: any) => {
    const addresses = Array.isArray(c?.addresses) ? c.addresses : [];
    return addresses.find((a: any) => a?.isDefault) || addresses[0] || null;
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
      { value: "50", label: "50 - page" },
      { value: "100", label: "100 - page" },
      { value: "200", label: "200 - page" },
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
            <th>Marketing</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {(filteredCustomers?.length ?? 0) === 0 ? (
            <tr className={sharedTableStyles.emptyStateRow}>
              <td className={sharedTableStyles.emptyTableCell} colSpan={5}>
                {loading ? "Loading customers…" : "No customers found."}
              </td>
            </tr>
          ) : (
            filteredCustomers.map((c: any, idx: number) => {
              const addr = getDefaultAddress(c);
              return (
                <tr
                  key={`${c._id}-${idx}`}
                  onClick={() => handleViewCustomer(c)}
                >
                  <td>{getFullName(c)}</td>
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
                    <Badge variant={c.isGuest ? "default" : "success"}>
                      {c.isGuest ? "Guest" : "Customer"}
                    </Badge>
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewCustomer(c);
                      }}
                    >
                      <Eye size={16} />
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
