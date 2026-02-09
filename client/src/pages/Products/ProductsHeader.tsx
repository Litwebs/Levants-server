import { Package, Plus } from "lucide-react";
import { Button } from "../../components/common";
import styles from "./Products.module.css";

const ProductsHeader = ({ setIsCreateModalOpen }: any) => {
  return (
    <div className={styles.header}>
      <div className={styles.titleSection}>
        <Package size={28} />
        <div>
          <h1 className={styles.title}>Products</h1>
          <p className={styles.subtitle}>
            Manage your product catalog and inventory
          </p>
        </div>
      </div>
      <Button onClick={() => setIsCreateModalOpen(true)}>
        <Plus size={18} />
        Add Product
      </Button>
    </div>
  );
};

export default ProductsHeader;
