import { Search, Filter, X } from "lucide-react";
import { Button, FiltersCardLayout, Select } from "../../components/common";
import styles from "./Orders.module.css";
import sharedFilterStyles from "../../components/common/FiltersCardLayout/SharedFilters.module.css";

const OrdersFilters = ({
  searchQuery,
  setSearchQuery,
  showFilters,
  setShowFilters,
  deliveryStatusFilter,
  setDeliveryStatusFilter,
  paymentStatusFilter,
  setPaymentStatusFilter,
  orderSourceFilter,
  setOrderSourceFilter,
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
  setExpiredOnly,
}: any) => {
  return (
    <FiltersCardLayout
      className={sharedFilterStyles.filtersCard}
      topRow={
        <div className={sharedFilterStyles.searchRow}>
          <div className={sharedFilterStyles.searchInput}>
            <Search size={18} className={sharedFilterStyles.searchIcon} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search orders..."
              className={sharedFilterStyles.search}
            />
            {searchQuery && (
              <button
                type="button"
                className={sharedFilterStyles.clearSearch}
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
            className={sharedFilterStyles.filtersToggleBtn}
          >
            Filters
          </Button>

          <Select
            value={sortBy}
            onChange={setSortBy}
            className={sharedFilterStyles.sortSelect}
            options={[
              { value: "newest", label: "Newest First" },
              { value: "oldest", label: "Oldest First" },
              { value: "total-high", label: "Total High → Low" },
              { value: "total-low", label: "Total Low → High" },
              { value: "delivery", label: "Delivery Date" },
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
            <label className={sharedFilterStyles.filterLabel}>
              Delivery Status
            </label>
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

          <div className={sharedFilterStyles.filterGroup}>
            <label className={sharedFilterStyles.filterLabel}>Created</label>
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

          <div className={sharedFilterStyles.filterGroup}>
            <label className={sharedFilterStyles.filterLabel}>
              Payment Status
            </label>
            <Select
              value={paymentStatusFilter}
              onChange={setPaymentStatusFilter}
              options={[
                { value: "all", label: "All Payment Statuses" },
                { value: "unpaid", label: "Unpaid" },
                { value: "paid", label: "Paid" },
                { value: "partially_paid", label: "Partially Paid" },
                { value: "refund_pending", label: "Refund Pending" },
                {
                  value: "partially_refunded",
                  label: "Partially Refunded",
                },
                { value: "refunded", label: "Refunded" },
              ]}
            />
          </div>

          <div className={sharedFilterStyles.filterGroup}>
            <label className={sharedFilterStyles.filterLabel}>
              Order Source
            </label>
            <Select
              value={orderSourceFilter}
              onChange={setOrderSourceFilter}
              options={[
                { value: "all", label: "All Sources" },
                { value: "website", label: "Website" },
                { value: "imported", label: "Imported" },
              ]}
            />
          </div>

          <div className={sharedFilterStyles.filterGroup}>
            <label className={sharedFilterStyles.filterLabel}>Date From</label>
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

          <div className={sharedFilterStyles.filterGroup}>
            <label className={sharedFilterStyles.filterLabel}>Date To</label>
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

          <div className={sharedFilterStyles.filterGroup}>
            <label className={sharedFilterStyles.filterLabel}>Min Total</label>
            <input
              type="number"
              inputMode="decimal"
              value={minTotal}
              onChange={(e) => setMinTotal(e.target.value)}
              className={styles.filterInput}
            />
          </div>

          <div className={sharedFilterStyles.filterGroup}>
            <label className={sharedFilterStyles.filterLabel}>Max Total</label>
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

          <Button
            variant="ghost"
            onClick={() => {
              setDeliveryStatusFilter("all");
              setPaymentStatusFilter("all");
              setOrderSourceFilter("all");
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
      }
    />
  );
};

export default OrdersFilters;
