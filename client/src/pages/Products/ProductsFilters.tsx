import { useState } from "react";
import { Search, Filter, X } from "lucide-react";
import { Button, FiltersCardLayout, Select } from "../../components/common";
import styles from "./Products.module.css";
import sharedFilterStyles from "../../components/common/FiltersCardLayout/SharedFilters.module.css";

const statuses = ["All", "active", "draft", "archived"];
const stockFilters = [
  { value: "All", label: "Stock Quantity" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
];

const ProductsFilters = ({
  searchQuery,
  setSearchQuery,
  sortBy,
  setSortBy,
  selectedCategory,
  setSelectedCategory,
  categoryOptions,
  selectedStatus,
  setSelectedStatus,
  variantStockFilter,
  setVariantStockFilter,
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
              placeholder="Search products..."
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
            <label className={sharedFilterStyles.filterLabel}>Category</label>
            <Select
              options={(categoryOptions || ["All"]).map((c: string) => ({
                value: c,
                label: c,
              }))}
              value={selectedCategory}
              onChange={setSelectedCategory}
              className={styles.filterSelect}
            />
          </div>

          <div className={sharedFilterStyles.filterGroup}>
            <label className={sharedFilterStyles.filterLabel}>Status</label>
            <Select
              options={statuses.map((s) => ({
                value: s,
                label: s.charAt(0).toUpperCase() + s.slice(1),
              }))}
              value={selectedStatus}
              onChange={setSelectedStatus}
              className={styles.filterSelect}
            />
          </div>

          <div className={sharedFilterStyles.filterGroup}>
            <label className={sharedFilterStyles.filterLabel}>Stock</label>
            <Select
              options={stockFilters}
              value={variantStockFilter}
              onChange={setVariantStockFilter}
              className={styles.filterSelect}
            />
          </div>

          <Button
            variant="ghost"
            onClick={() => {
              setSearchQuery("");
              setSelectedCategory("All");
              setSelectedStatus("All");
              setVariantStockFilter("All");
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

export default ProductsFilters;
