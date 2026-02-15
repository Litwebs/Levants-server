import { Search, Filter, X } from "lucide-react";
import { Card, Button, Select } from "../../components/common";
import styles from "./Orders.module.css";

const OrdersFilters = ({
  searchQuery,
  setSearchQuery,
  showFilters,
  setShowFilters,

  // rename these in parent if you can:
  deliveryStatusFilter,
  setDeliveryStatusFilter,

  dateFilter,
  setDateFilter,
  sortBy,
  setSortBy,

  minTotal,
  setMinTotal,
  maxTotal,
  setMaxTotal,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  refundedOnly,
  setRefundedOnly,
  expiredOnly,
  setExpiredOnly,
}: any) => {
  return (
    <Card className={styles.filtersCard}>
      <div className={styles.searchRow}>
        <div className={styles.searchInput}>
          <Search size={18} className={styles.searchIcon} />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search orders..."
            className={styles.search}
          />
          {searchQuery && (
            <button
              type="button"
              className={styles.clearSearch}
              onClick={() => setSearchQuery("")}
            >
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
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Delivery Status</label>
            <Select
              value={deliveryStatusFilter}
              onChange={setDeliveryStatusFilter}
              options={[
                { value: "all", label: "All Delivery Statuses" },
                { value: "ordered", label: "Ordered" },
                { value: "dispatched", label: "Dispatched" },
                { value: "in_transit", label: "In Transit" },
                { value: "delivered", label: "Delivered" },
                { value: "returned", label: "Returned" },
              ]}
            />
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Created</label>
            <Select
              value={dateFilter}
              onChange={setDateFilter}
              options={[
                { value: "all", label: "All Time" },
                { value: "today", label: "Today" },
                { value: "week", label: "Last 7 Days" },
                { value: "month", label: "Last 30 Days" },
                { value: "custom", label: "Custom Range" },
              ]}
            />
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Date From</label>
            <input
              type="date"
              className={styles.filterInput}
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setDateFilter("custom");
              }}
            />
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Date To</label>
            <input
              type="date"
              className={styles.filterInput}
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setDateFilter("custom");
              }}
            />
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Min Total</label>
            <input
              type="number"
              inputMode="decimal"
              value={minTotal}
              onChange={(e) => setMinTotal(e.target.value)}
              className={styles.filterInput}
            />
          </div>

          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>Max Total</label>
            <input
              type="number"
              inputMode="decimal"
              value={maxTotal}
              onChange={(e) => setMaxTotal(e.target.value)}
              className={styles.filterInput}
            />
          </div>

          <label className={styles.checkboxFilter}>
            <input
              type="checkbox"
              checked={refundedOnly}
              onChange={(e) => setRefundedOnly(e.target.checked)}
            />
            Refunded only
          </label>

          {/* <label className={styles.checkboxFilter}>
            <input
              type="checkbox"
              checked={expiredOnly}
              onChange={(e) => setExpiredOnly(e.target.checked)}
            />
            Expired only
          </label> */}

          <Button
            variant="ghost"
            onClick={() => {
              setDeliveryStatusFilter("all");
              setDateFilter("all");
              setSearchQuery("");
              setMinTotal("");
              setMaxTotal("");
              setDateFrom("");
              setDateTo("");
              setRefundedOnly(false);
              setExpiredOnly(false);
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
