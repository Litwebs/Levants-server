import { Package, Plus } from "lucide-react";
import { Button } from "../../components/common";
import { usePermissions } from "@/hooks/usePermissions";
import styles from "./Products.module.css";

const ProductsHeader = ({ handleCreateProduct }: any) => {
  const { hasPermission } = usePermissions();
  const canCreateProduct = hasPermission("products.create");

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
      {canCreateProduct ? (
        <Button onClick={handleCreateProduct}>
          <Plus size={18} />
          Add Product
        </Button>
      ) : null}
    </div>
  );
};

export default ProductsHeader;
