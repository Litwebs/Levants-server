import { useState } from "react";
import { Search, X, Filter } from "lucide-react";
import { Button, FiltersCardLayout, Select } from "../../components/common";
import sharedFilterStyles from "../../components/common/FiltersCardLayout/SharedFilters.module.css";

type SortOption = "newest" | "oldest" | "name-asc" | "name-desc";
type CustomerType = "all" | "guest" | "registered";

type CustomersFiltersProps = {
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  sortBy: SortOption;
  setSortBy: (value: SortOption) => void;
  customerTypeFilter: CustomerType;
  setCustomerTypeFilter: (value: CustomerType) => void;
};

const CustomersFilters = ({
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  customerTypeFilter,
  setCustomerTypeFilter,
}: CustomersFiltersProps) => {
  const [showFilters, setShowFilters] = useState(false);
  const activeFilterCount = customerTypeFilter === "all" ? 0 : 1;

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
              placeholder="Search by name, email, phone, or postcode..."
              className={sharedFilterStyles.search}
            />
            {searchQuery && (
              <button
                type="button"
                className={sharedFilterStyles.clearSearch}
                onClick={() => setSearchQuery("")}
                aria-label="Clear customer search"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <Button
            variant="outline"
            leftIcon={<Filter size={16} />}
            onClick={() => setShowFilters((visible) => !visible)}
            className={sharedFilterStyles.filtersToggleBtn}
            aria-expanded={showFilters}
          >
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
          </Button>

          <Select
            value={sortBy}
            onChange={(value) => setSortBy(value as SortOption)}
            className={sharedFilterStyles.sortSelect}
            options={[
              { value: "newest", label: "Newest First" },
              { value: "oldest", label: "Oldest First" },
              { value: "name-asc", label: "Name A → Z" },
              { value: "name-desc", label: "Name Z → A" },
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
              Customer Type
            </label>
            <Select
              value={customerTypeFilter}
              onChange={(value) => setCustomerTypeFilter(value as CustomerType)}
              options={[
                { value: "all", label: "All Customers" },
                { value: "registered", label: "Registered accounts" },
                { value: "guest", label: "Guests" },
              ]}
            />
          </div>

          <Button
            variant="ghost"
            onClick={() => {
              setSearchQuery("");
              setCustomerTypeFilter("all");
              setSortBy("newest");
            }}
          >
            Clear Filters
          </Button>
        </div>
      }
    />
  );
};

export default CustomersFilters;
