import { useState } from "react";
import { Search, X, Filter } from "lucide-react";
import { Button, FiltersCardLayout, Select } from "../../components/common";
import sharedFilterStyles from "../../components/common/FiltersCardLayout/SharedFilters.module.css";

const CustomersFilters = ({
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  customerTypeFilter,
  setCustomerTypeFilter,
}: any) => {
  const [showFilters, setShowFilters] = useState(false);

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
              onChange={setCustomerTypeFilter}
              options={[
                { value: "all", label: "All Customers" },
                { value: "customer", label: "Registered" },
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
