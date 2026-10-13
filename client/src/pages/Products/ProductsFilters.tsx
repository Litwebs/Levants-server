import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronDown, Search, Filter, Plus, X } from "lucide-react";
import {
  Button,
  FiltersCardLayout,
  Input,
  Select,
} from "../../components/common";
import { usePermissions } from "@/hooks/usePermissions";
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
  const navigate = useNavigate();
  const { hasPermission } = usePermissions();
  const canCreateProduct = hasPermission("products.create");

  return (
    <FiltersCardLayout
      className={sharedFilterStyles.filtersCard}
      topRow={
        <div className={sharedFilterStyles.searchRow}>
          <div className={sharedFilterStyles.searchInput}>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              aria-label="Search products"
              className={sharedFilterStyles.searchControl}
              leftIcon={<Search size={18} />}
              fullWidth
            />
            {searchQuery && (
              <button
                type="button"
                className={sharedFilterStyles.clearSearch}
                onClick={() => setSearchQuery("")}
                aria-label="Clear product search"
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
                className={`${sharedFilterStyles.filtersChevron} ${showFilters ? sharedFilterStyles.filtersChevronOpen : ""}`}
                aria-hidden="true"
              />
            }
            aria-expanded={showFilters}
            aria-controls="product-filters-panel"
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

          {canCreateProduct ? (
            <Button
              className={styles.createProductButton}
              size="sm"
              leftIcon={<Plus size={16} />}
              onClick={() => navigate("/products/new")}
            >
              Add product
            </Button>
          ) : null}
        </div>
      }
      isExpanded={showFilters}
      expandedId="product-filters-panel"
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
            variant="outline"
            size="sm"
            className={styles.clearFilters}
            onClick={() => {
              setSearchQuery("");
              setSelectedCategory("All");
              setSelectedStatus("All");
              setVariantStockFilter("All");
              setSortBy("newest");
            }}
          >
            Clear all filters
          </Button>
        </div>
      }
    />
  );
};

export default ProductsFilters;
