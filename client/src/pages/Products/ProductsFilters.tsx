import { Search } from "lucide-react";
import { Card, Input } from "../../components/common";
import { Select } from "../../components/common/Select/Select";
import styles from "./Products.module.css";

const statuses = ["All", "active", "draft", "archived"];
const stockFilters = [
  { value: "All", label: "Stock Quantity" },
  { value: "low", label: "Low stock" },
  { value: "out", label: "Out of stock" },
];

const ProductsFilters = ({
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  categoryOptions,
  selectedStatus,
  setSelectedStatus,
  variantStockFilter,
  setVariantStockFilter,
}: any) => {
  return (
    <Card className={styles.filtersCard}>
      <div className={styles.filters}>
        <Input
          placeholder="Search products..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          leftIcon={<Search size={18} />}
          className={styles.searchInput}
        />
        <Select
          options={(categoryOptions || ["All"]).map((c: string) => ({
            value: c,
            label: c,
          }))}
          value={selectedCategory}
          onChange={setSelectedCategory}
          className={styles.filterSelect}
        />
        <Select
          options={statuses.map((s) => ({
            value: s,
            label: s.charAt(0).toUpperCase() + s.slice(1),
          }))}
          value={selectedStatus}
          onChange={setSelectedStatus}
          className={styles.filterSelect}
        />

        <Select
          options={stockFilters}
          value={variantStockFilter}
          onChange={setVariantStockFilter}
          className={styles.filterSelect}
        />
      </div>
    </Card>
  );
};

export default ProductsFilters;
