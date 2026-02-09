import { Search } from "lucide-react";
import { Card, Input } from "../../components/common";
import { Select } from "../../components/common/Select/Select";
import styles from "./Products.module.css";

const categories = [
  "All",
  "Milk",
  "Milkshakes",
  "Cream",
  "Honey",
  "Butter",
  "Cheese",
];
const statuses = ["All", "active", "draft", "archived"];

const ProductsFilters = ({
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  selectedStatus,
  setSelectedStatus,
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
          options={categories.map((c) => ({ value: c, label: c }))}
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
      </div>
    </Card>
  );
};

export default ProductsFilters;
