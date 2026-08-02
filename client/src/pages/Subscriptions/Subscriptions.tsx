import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  useSubscriptions,
  type Subscription,
} from "../../context/Subscriptions";
import {
  DataTableCard,
  FiltersCardLayout,
  Button,
  Select as CommonSelect,
  Badge,
  Table,
} from "../../components/common";
import sharedTableStyles from "../../components/common/DataTableCard/DataTableCard.module.css";
import sharedFilterStyles from "../../components/common/FiltersCardLayout/SharedFilters.module.css";
import styles from "./Subscriptions.module.css";
import { RefreshCw, X as XIcon, Search, Filter, Plus, FileUp } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import BulkSubscriptionImportModal from "./BulkSubscriptionImportModal";

const FREQUENCY_LABELS: Record<string, string> = {
  weekly: "Weekly",
  every_two_weeks: "Every 2 weeks",
  monthly: "Monthly",
};

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_VARIANTS: Record<
  string,
  "success" | "warning" | "error" | "default"
> = {
  active: "success",
  pending: "default",
  paused: "warning",
  cancelled: "error",
};

const getCustomerName = (customer: Subscription["customer"]) => {
  if (!customer) return "Unknown customer";
  if (typeof customer === "string") return customer;
  return `${customer.firstName} ${customer.lastName}`;
};

const getCustomerEmail = (customer: Subscription["customer"]) => {
  if (!customer || typeof customer === "string") return "";
  return customer.email;
};

export default function SubscriptionsPage() {
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const { subscriptions, meta, loading, error, listSubscriptions } =
    useSubscriptions();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [frequencyFilter, setFrequencyFilter] = useState("all");
  const [sortBy, setSortBy] = useState("newest");
  const [showFilters, setShowFilters] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const fetchSubscriptions = useCallback(() => {
    listSubscriptions({
      page,
      pageSize: 20,
      status: statusFilter !== "all" ? statusFilter : undefined,
      frequency: frequencyFilter !== "all" ? frequencyFilter : undefined,
      search: search || undefined,
      sortBy,
    });
  }, [
    listSubscriptions,
    page,
    statusFilter,
    frequencyFilter,
    search,
    sortBy,
  ]);

  useEffect(() => {
    const t = setTimeout(fetchSubscriptions, 300);
    return () => clearTimeout(t);
  }, [fetchSubscriptions]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, frequencyFilter, sortBy]);

  const sortedSubscriptions = useMemo(() => {
    const next = [...subscriptions];
    switch (sortBy) {
      case "newest":
        next.sort((a, b) => {
          const at = new Date(a.createdAt || a.startDate || 0).getTime();
          const bt = new Date(b.createdAt || b.startDate || 0).getTime();
          return bt - at;
        });
        break;
      case "oldest":
        next.sort((a, b) => {
          const at = new Date(a.createdAt || a.startDate || 0).getTime();
          const bt = new Date(b.createdAt || b.startDate || 0).getTime();
          return at - bt;
        });
        break;
      case "next-delivery":
      default:
        next.sort((a, b) => {
          const at = a.nextDeliveryDate
            ? new Date(a.nextDeliveryDate).getTime()
            : Number.POSITIVE_INFINITY;
          const bt = b.nextDeliveryDate
            ? new Date(b.nextDeliveryDate).getTime()
            : Number.POSITIVE_INFINITY;
          return at - bt;
        });
        break;
    }
    return next;
  }, [subscriptions, sortBy]);

  const totalPages = meta ? Math.ceil(meta.total / 20) : 1;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className="text-2xl font-semibold">Subscriptions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {meta?.total ?? 0} total subscriptions
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchSubscriptions}
            leftIcon={<RefreshCw size={16} />}
          >
            Refresh
          </Button>
          {hasPermission("subscriptions.import") && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowImport(true)}
              leftIcon={<FileUp size={16} />}
            >
              Import CSV
            </Button>
          )}
          <Button
            size="sm"
            onClick={() => navigate("/subscriptions/new")}
            leftIcon={<Plus size={16} />}
          >
            Create subscription
          </Button>
        </div>
      </div>

      {/* Filters */}
      <FiltersCardLayout
        className={sharedFilterStyles.filtersCard}
        topRow={
          <div className={sharedFilterStyles.searchRow}>
            <div className={sharedFilterStyles.searchInput}>
              <Search size={18} className={sharedFilterStyles.searchIcon} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer..."
                className={sharedFilterStyles.search}
              />
              {search && (
                <Button
                  variant="ghost"
                  size="sm"
                  className={sharedFilterStyles.clearSearch}
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  <XIcon size={16} />
                </Button>
              )}
            </div>

            <Button
              variant="outline"
              leftIcon={<Filter size={16} />}
              onClick={() => setShowFilters(!showFilters)}
              className={sharedFilterStyles.filtersToggleBtn}
            >
              Filters
            </Button>

            <CommonSelect
              value={sortBy}
              onChange={setSortBy}
              className={sharedFilterStyles.sortSelect}
              options={[
                { value: "newest", label: "Newest created" },
                { value: "oldest", label: "Oldest created" },
                { value: "next-delivery", label: "Next delivery" },
              ]}
            />
          </div>
        }
        isExpanded={showFilters}
        expandedWrapClassName={sharedFilterStyles.filtersRowWrap}
        expandedOpenClassName={sharedFilterStyles.filtersRowOpen}
        expandedInnerClassName={sharedFilterStyles.filtersRowInner}
        expandedContent={
          <div className={sharedFilterStyles.filtersRow}>
            <div className={sharedFilterStyles.filterGroup}>
              <label className={sharedFilterStyles.filterLabel}>Status</label>
              <CommonSelect
                value={statusFilter}
                onChange={setStatusFilter}
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "pending", label: "Pending setup" },
                  { value: "active", label: "Active" },
                  { value: "paused", label: "Paused" },
                  { value: "cancelled", label: "Cancelled" },
                ]}
              />
            </div>

            <div className={sharedFilterStyles.filterGroup}>
              <label className={sharedFilterStyles.filterLabel}>
                Frequency
              </label>
              <CommonSelect
                value={frequencyFilter}
                onChange={setFrequencyFilter}
                options={[
                  { value: "all", label: "All frequencies" },
                  { value: "weekly", label: "Weekly" },
                  { value: "every_two_weeks", label: "Every 2 weeks" },
                  { value: "monthly", label: "Monthly" },
                ]}
              />
            </div>

            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setFrequencyFilter("all");
                setSortBy("newest");
              }}
            >
              Clear Filters
            </Button>
          </div>
        }
      />

      {/* Table */}
      {error ? (
        <p className="text-destructive">{error}</p>
      ) : (
        <DataTableCard
          className={styles.tableCard}
          pagination={{
            page,
            pageSize: 20,
            total: meta?.total ?? subscriptions.length,
            totalPages,
            setPage,
            setPageSize: () => undefined,
            pageSizeOptions: [{ value: "20", label: "20 - page" }],
            loading,
          }}
        >
          <Table withWrapper={false} tableClassName={sharedTableStyles.table}>
            <thead>
              <tr>
                <th>Ref</th>
                <th>Customer</th>
                <th>Status</th>
                <th>Frequency</th>
                <th>Delivery Day</th>
                <th>Next Delivery</th>
                <th>Created</th>
                <th>Items</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr className={sharedTableStyles.emptyStateRow}>
                  <td colSpan={8} className={sharedTableStyles.emptyTableCell}>
                    Loading…
                  </td>
                </tr>
              ) : sortedSubscriptions.length === 0 ? (
                <tr className={sharedTableStyles.emptyStateRow}>
                  <td colSpan={8} className={sharedTableStyles.emptyTableCell}>
                    No subscriptions found
                  </td>
                </tr>
              ) : (
                sortedSubscriptions.map((sub) => (
                  <tr
                    key={sub._id}
                    className={`${styles.clickableRow} ${sub.isPendingSetup ? styles.pendingRow : ""}`}
                    role="link"
                    tabIndex={0}
                    aria-label={`View ${sub.subscriptionNumber} for ${getCustomerName(sub.customer)}`}
                    onClick={() => navigate(`/subscriptions/${sub._id}`)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(`/subscriptions/${sub._id}`);
                      }
                    }}
                  >
                    <td className="font-mono text-xs">
                      {sub.subscriptionNumber}
                    </td>
                    <td>
                      <div className="font-medium">
                        {getCustomerName(sub.customer)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {getCustomerEmail(sub.customer)}
                      </div>
                    </td>
                    <td>
                      <Badge variant={STATUS_VARIANTS[sub.status] ?? "default"}>
                        {sub.status}
                      </Badge>
                    </td>
                    <td className="text-sm">
                      {FREQUENCY_LABELS[sub.frequency] ?? sub.frequency}
                    </td>
                    <td className="text-sm">
                      {(sub.preferredDeliveryDays?.length
                        ? sub.preferredDeliveryDays
                        : [sub.preferredDeliveryDay]
                      )
                        .map((day) => DAY_LABELS[day] ?? day)
                        .join(", ")}
                    </td>
                    <td className="text-sm">
                      {sub.nextDeliveryDate
                        ? new Date(sub.nextDeliveryDate).toLocaleDateString(
                            "en-GB",
                          )
                        : "Awaiting setup"}
                    </td>
                    <td className="text-sm">
                      {sub.createdAt
                        ? new Date(sub.createdAt).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </td>
                    <td className="text-sm">{sub.items.length}</td>
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </DataTableCard>
      )}

      <BulkSubscriptionImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImported={fetchSubscriptions}
      />
    </div>
  );
}
