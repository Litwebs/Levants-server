import { Search, Filter, X } from "lucide-react";
import {
  Button,
  FiltersCardLayout,
  Input,
  Select,
  Toggle,
} from "../../components/common";
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
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search orders..."
              className={sharedFilterStyles.searchControl}
              leftIcon={<Search size={18} />}
              fullWidth
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
        <div className={styles.filtersPanel}>
          <fieldset className={styles.filtersGroup}>
            <legend className={styles.filtersGroupTitle}>Order details</legend>
            <div className={styles.filtersGroupControls}>
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
                    { value: "subscription", label: "Subscriptions" },
                    { value: "imported", label: "Imported" },
                  ]}
                />
              </div>
            </div>
          </fieldset>

          <fieldset className={styles.filtersGroup}>
            <legend className={styles.filtersGroupTitle}>Created date</legend>
            <div className={styles.filtersGroupControls}>
              <div className={sharedFilterStyles.filterGroup}>
                <label className={sharedFilterStyles.filterLabel}>Range</label>
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

              <Input
                className={sharedFilterStyles.filterGroup}
                label="From"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setDateFilter("custom");
                }}
              />

              <Input
                className={sharedFilterStyles.filterGroup}
                label="To"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setDateFilter("custom");
                }}
              />
            </div>
          </fieldset>

          <fieldset className={styles.filtersGroup}>
            <legend className={styles.filtersGroupTitle}>Order value</legend>
            <div className={styles.filtersGroupControls}>
              <Input
                className={sharedFilterStyles.filterGroup}
                label="Minimum total"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={minTotal}
                onChange={(e) => setMinTotal(e.target.value)}
              />

              <Input
                className={sharedFilterStyles.filterGroup}
                label="Maximum total"
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={maxTotal}
                onChange={(e) => setMaxTotal(e.target.value)}
              />
              <div className={styles.toggleFilter}>
                <Toggle
                  id="refunded-only"
                  checked={refundedOnly}
                  onChange={(event) => setRefundedOnly(event.target.checked)}
                />
                <label htmlFor="refunded-only">Refunded only</label>
              </div>
              <div className={styles.filtersActions}>
                <Button
                  variant="outline"
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
                  Clear all filters
                </Button>
              </div>
            </div>
          </fieldset>
        </div>
      }
    />
  );
};

export default OrdersFilters;
