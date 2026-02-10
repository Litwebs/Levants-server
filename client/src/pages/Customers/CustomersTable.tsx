import {
  Eye,
  Phone,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import {
  Card,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  Button,
  Badge,
  Select,
  CardFooter,
} from "../../components/common";
import styles from "./Customers.module.css";
import { useState, useEffect } from "react";

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
  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(page * pageSize, total);

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

  const [paginationAction, setPaginationAction] = useState<
    "prev" | "next" | null
  >(null);

  useEffect(() => {
    if (!loading) {
      setPaginationAction(null);
    }
  }, [loading]);

  return (
    <Card className={styles.tableCard}>
      <div className={styles.tableArea}>
        <Table className={styles.tableScroll}>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Contact</TableHead>
              {/* <TableHead>Orders</TableHead> */}
              <TableHead>Last Order</TableHead>
              <TableHead>Marketing</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {(filteredCustomers?.length ?? 0) === 0 ? (
              <TableRow>
                <TableCell className={styles.emptyTableCell}>
                  {loading ? "Loading customers…" : "No customers found."}
                </TableCell>
                <TableCell>{""}</TableCell>
                <TableCell>{""}</TableCell>
                <TableCell>{""}</TableCell>
                <TableCell>{""}</TableCell>
                <TableCell>{""}</TableCell>
              </TableRow>
            ) : (
              filteredCustomers.map((c: any, idx: number) => {
                const addr = getDefaultAddress(c);
                return (
                  <TableRow
                    key={`${c._id}-${idx}`}
                    onClick={() => handleViewCustomer(c)}
                  >
                    <TableCell>{getFullName(c)}</TableCell>
                    <TableCell>
                      <div className={styles.contactCell}>
                        <span>
                          <Phone size={14} /> {c.phone || "—"}
                        </span>
                        <span>
                          <MapPin size={14} /> {addr?.postcode || "—"}
                        </span>
                      </div>
                    </TableCell>
                    {/* <TableCell>{"—"}</TableCell> */}
                    <TableCell>{formatLastOrder(c.lastOrderAt)}</TableCell>
                    <TableCell>
                      <Badge variant={c.isGuest ? "default" : "success"}>
                        {c.isGuest ? "Guest" : "Customer"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleViewCustomer(c)}
                      >
                        <Eye size={16} />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {loading && (
          <div className={styles.tableLoadingOverlay} aria-live="polite">
            <div className={styles.tableLoadingInner}>
              <Loader2 size={16} className={styles.spinnerIcon} />
              Loading…
            </div>
          </div>
        )}
      </div>

      <CardFooter className={styles.paginationFooter}>
        <div className={styles.paginationInfo}>
          Showing {rangeStart}–{rangeEnd} of {total}
        </div>

        <div className={styles.paginationControls}>
          <Select
            className={styles.pageSizeSelect}
            value={String(pageSize)}
            disabled={loading}
            onChange={(v) => {
              setPageSize(Number(v));
              setPage(1);
            }}
            options={[
              { value: "10", label: "10 / page" },
              { value: "20", label: "20 / page" },
              { value: "50", label: "50 / page" },
            ]}
          />

          <div className={styles.pageButtons}>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page <= 1}
              onClick={() => {
                setPaginationAction("prev");
                setPage((p) => Math.max(1, p - 1));
              }}
            >
              {loading && paginationAction === "prev" ? (
                <Loader2 size={14} className={styles.spinnerIcon} />
              ) : (
                <>
                  <ChevronLeft size={16} />
                  Prev
                </>
              )}
            </Button>

            <div className={styles.pageLabel}>
              Page {page} / {totalPages}
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={loading || page >= totalPages}
              onClick={() => {
                setPaginationAction("next");
                setPage((p) => Math.min(totalPages, p + 1));
              }}
            >
              {loading && paginationAction === "next" ? (
                <Loader2 size={14} className={styles.spinnerIcon} />
              ) : (
                <>
                  Next
                  <ChevronRight size={16} />
                </>
              )}
            </Button>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
};

export default CustomersTable;
