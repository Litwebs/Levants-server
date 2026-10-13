import { RefreshCw } from "lucide-react";
import { Button } from "../../components/common";
import styles from "./Products.module.css";

const ProductsHeader = ({ paginationMeta, stats, fetchProducts, isLoading }: any) => {
  const productCount = paginationMeta?.total ?? stats?.total ?? 0;

  return (
    <div className={styles.header}>
      <div>
        <h1 className={styles.title}>Products</h1>
        <p className={styles.subtitle}>
          {productCount} {productCount === 1 ? "product" : "products"} found
        </p>
      </div>
      <div className={styles.headerActions}>
        <Button
          variant="outline"
          size="sm"
          leftIcon={<RefreshCw size={16} />}
          onClick={() => void fetchProducts()}
          disabled={isLoading}
        >
          Refresh
        </Button>
      </div>
    </div>
  );
};

export default ProductsHeader;
