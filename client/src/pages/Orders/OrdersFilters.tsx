import { Search, Filter, X } from "lucide-react";
import { Card, Button, Select } from "../../components/common";
import styles from "./Orders.module.css";

const OrdersFilters = ({
  searchQuery,
  setSearchQuery,
  showFilters,
  setShowFilters,
  paymentFilter,
  setPaymentFilter,
  dateFilter,
  setDateFilter,
  sortBy,
  setSortBy,
}: any) => {
  return (
    <Card className={styles.filtersCard}>
      <div className={styles.searchRow}>
        <div className={styles.searchInput}>
          <Search size={18} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search orders..."
            className={styles.search}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery("")}>
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
        </Button>

        <Select
          value={sortBy}
          onChange={setSortBy}
          options={[
            { value: "newest", label: "Newest First" },
            { value: "oldest", label: "Oldest First" },
            { value: "total-high", label: "Total High → Low" },
            { value: "total-low", label: "Total Low → High" },
            { value: "delivery", label: "Delivery Date" },
          ]}
        />
      </div>

      {showFilters && (
        <div className={styles.filtersRow}>
          <Select
            value={paymentFilter}
            onChange={setPaymentFilter}
            options={[
              { value: "all", label: "All Payments" },
              { value: "paid", label: "Paid" },
              { value: "unpaid", label: "Unpaid" },
              { value: "refunded", label: "Refunded" },
            ]}
          />

          <Select
            value={dateFilter}
            onChange={setDateFilter}
            options={[
              { value: "all", label: "All Time" },
              { value: "today", label: "Today" },
              { value: "week", label: "Last 7 Days" },
              { value: "month", label: "Last 30 Days" },
            ]}
          />

          <Button
            variant="ghost"
            onClick={() => {
              setPaymentFilter("all");
              setDateFilter("all");
              setSearchQuery("");
            }}
          >
            Clear Filters
          </Button>
        </div>
      )}
    </Card>
  );
};

export default OrdersFilters;
