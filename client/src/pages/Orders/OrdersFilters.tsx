import { ChevronDown, Search, Filter, X } from "lucide-react";
import {
  Button,
  FiltersCardLayout,
  Input,
  Select,
  Toggle,
} from "../../components/common";
import styles from "./Orders.module.css";
import type { OrdersPageState } from "./useOrders";
import sharedFilterStyles from "../../components/common/FiltersCardLayout/SharedFilters.module.css";

type OrdersFiltersProps = Pick<
  OrdersPageState,
  | "searchQuery"
  | "setSearchQuery"
  | "showFilters"
  | "setShowFilters"
  | "deliveryStatusFilter"
  | "setDeliveryStatusFilter"
  | "paymentStatusFilter"
  | "setPaymentStatusFilter"
  | "orderSourceFilter"
  | "setOrderSourceFilter"
  | "dateFilter"
  | "setDateFilter"
  | "sortBy"
  | "setSortBy"
  | "minTotal"
  | "setMinTotal"
  | "maxTotal"
  | "setMaxTotal"
  | "dateFrom"
  | "setDateFrom"
  | "dateTo"
  | "setDateTo"
  | "refundedOnly"
  | "setRefundedOnly"
  | "setExpiredOnly"
>;

const SORT_OPTIONS = [
  { value: "newest", label: "Newest First" },
  { value: "oldest", label: "Oldest First" },
  { value: "total-high", label: "Total High → Low" },
  { value: "total-low", label: "Total Low → High" },
  { value: "delivery", label: "Delivery Date" },
];

const DELIVERY_STATUS_OPTIONS = [
  { value: "all", label: "All Delivery Statuses" },
  { value: "ordered", label: "Ordered" },
  { value: "dispatched", label: "Dispatched" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
  { value: "returned", label: "Returned" },
];

const PAYMENT_STATUS_OPTIONS = [
  { value: "all", label: "All Payment Statuses" },
  { value: "unpaid", label: "Unpaid" },
  { value: "paid", label: "Paid" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "refund_pending", label: "Refund Pending" },
  { value: "partially_refunded", label: "Partially Refunded" },
  { value: "refunded", label: "Refunded" },
];

const SOURCE_OPTIONS = [
  { value: "all", label: "All Sources" },
  { value: "website", label: "Website" },
  { value: "subscription", label: "Subscriptions" },
  { value: "imported", label: "Imported" },
];

const DATE_RANGE_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 Days" },
  { value: "month", label: "Last 30 Days" },
  { value: "custom", label: "Custom Range" },
];

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
}: OrdersFiltersProps) => {
  const minimum = minTotal === "" ? null : Number(minTotal);
  const maximum = maxTotal === "" ? null : Number(maxTotal);
  const minimumError =
    minimum !== null && (!Number.isFinite(minimum) || minimum < 0)
      ? "Enter zero or more"
      : minimum !== null && maximum !== null && minimum > maximum
        ? "Must not exceed maximum"
        : undefined;
  const maximumError =
    maximum !== null && (!Number.isFinite(maximum) || maximum < 0)
      ? "Enter zero or more"
      : minimum !== null && maximum !== null && minimum > maximum
        ? "Must be at least minimum"
        : undefined;
  const dateRangeInvalid = Boolean(dateFrom && dateTo && dateFrom > dateTo);
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
              aria-label="Search orders"
              className={sharedFilterStyles.searchControl}
              leftIcon={<Search size={18} />}
              fullWidth
            />
            {searchQuery && (
              <button
                type="button"
                className={sharedFilterStyles.clearSearch}
                onClick={() => setSearchQuery("")}
                aria-label="Clear order search"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <Button
            variant="outline"
            leftIcon={<Filter size={16} />}
            rightIcon={
              <ChevronDown
                size={16}
                className={`${sharedFilterStyles.filtersChevron} ${
                  showFilters ? sharedFilterStyles.filtersChevronOpen : ""
                }`}
                aria-hidden="true"
              />
            }
            aria-expanded={showFilters}
            aria-controls="orders-filters-panel"
            onClick={() => setShowFilters(!showFilters)}
            className={sharedFilterStyles.filtersToggleBtn}
          >
            Filters
          </Button>

          <Select
            value={sortBy}
            onChange={setSortBy}
            className={sharedFilterStyles.sortSelect}
            options={SORT_OPTIONS}
          />
        </div>
      }
      isExpanded={showFilters}
      expandedId="orders-filters-panel"
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
                  options={DELIVERY_STATUS_OPTIONS}
                />
              </div>

              <div className={sharedFilterStyles.filterGroup}>
                <label className={sharedFilterStyles.filterLabel}>
                  Payment Status
                </label>
                <Select
                  value={paymentStatusFilter}
                  onChange={setPaymentStatusFilter}
                  options={PAYMENT_STATUS_OPTIONS}
                />
              </div>

              <div className={sharedFilterStyles.filterGroup}>
                <label className={sharedFilterStyles.filterLabel}>
                  Order Source
                </label>
                <Select
                  value={orderSourceFilter}
                  onChange={setOrderSourceFilter}
                  options={SOURCE_OPTIONS}
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
                  options={DATE_RANGE_OPTIONS}
                />
              </div>

              <Input
                className={sharedFilterStyles.filterGroup}
                label="From"
                type="date"
                error={dateRangeInvalid ? "Must be before To" : undefined}
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
                error={dateRangeInvalid ? "Must be after From" : undefined}
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
                min="0"
                step="0.01"
                error={minimumError}
                placeholder="0.00"
                value={minTotal}
                onChange={(e) => setMinTotal(e.target.value)}
              />

              <Input
                className={sharedFilterStyles.filterGroup}
                label="Maximum total"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                error={maximumError}
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
